const fetch = require("node-fetch");
const OpenAI = require("openai");

const botToken = process.env.TELEGRAM_TOKEN;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_lieJntC1Hf4FxU02SkyMIQSq";

// Для хранения thread'ов по chat_id (перезапускается на каждом cold start, для production лучше использовать базу)
const threadMap = {};

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      const body = req.body;
      if (body && body.message && body.message.chat && body.message.text) {
        const chatId = body.message.chat.id;
        const userMessage = body.message.text;

        // 1. Получаем/создаем thread для пользователя
        let threadId = threadMap[chatId];
        if (!threadId) {
          const thread = await openai.beta.threads.create();
          threadId = thread.id;
          threadMap[chatId] = threadId;
        }

        // 2. Добавляем сообщение пользователя в thread
        await openai.beta.threads.messages.create(threadId, {
          role: "user",
          content: userMessage,
        });

        // 3. Запускаем ассистента
        const run = await openai.beta.threads.runs.create(threadId, {
          assistant_id: assistantId,
        });

        // 4. Ожидаем завершения run (до 30 сек)
        let runStatus, attempts = 0;
        do {
          await new Promise(res => setTimeout(res, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
          attempts++;
        } while (runStatus.status !== "completed" && attempts < 30);

        let responseText = "Извините, не удалось получить ответ от ассистента.";
        if (runStatus.status === "completed") {
          // 5. Получаем последнее сообщение ассистента
          const messages = await openai.beta.threads.messages.list(threadId);
          const assistantMessage = messages.data.reverse().find(m => m.role === "assistant");
          responseText = assistantMessage?.content[0]?.text?.value || responseText;
        }

        // 6. Отправляем ответ пользователю через Telegram API
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
          }),
        });
      }
      res.status(200).send("ok");
    } else {
      res.status(200).send("Bot is running (webhook model)");
    }
  } catch (err) {
    console.error("Ошибка в webhook handler:", err);
    res.status(500).send("Internal server error");
  }
};
