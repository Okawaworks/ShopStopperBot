const fetch = require("node-fetch");
const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');

const botToken = process.env.TELEGRAM_TOKEN;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_lieJntC1Hf4FxU02SkyMIQSq";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// In-memory для OpenAI-ассистента (можно вынести в базу аналогично статистике)
const threadMap = {};
const lastAssistantMessageId = {};

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      const body = req.body;
      if (body && body.message && body.message.chat && body.message.text) {
        const chatId = body.message.chat.id;
        const userMessage = body.message.text.trim();

        // --- Работа со статистикой в Supabase ---
        // 1. /купил — ждем сумму
        if (userMessage === "/купил") {
          await sendTelegram(chatId, "На какую сумму купили?");
          await supabase
            .from('user_stats')
            .upsert([{ chat_id: chatId }]);
          await supabase
            .from('user_stats')
            .update({ state: "waiting_for_amount" })
            .eq('chat_id', chatId);
          return res.status(200).send("ok");
        }

        // 2. Проверяем состояние пользователя (ждет сумму)
        const { data: userRow } = await supabase
          .from('user_stats')
          .select('*')
          .eq('chat_id', chatId)
          .single();

        if (userRow && userRow.state === "waiting_for_amount") {
          const amount = parseFloat(userMessage.replace(',', '.'));
          if (!isNaN(amount) && amount > 0) {
            const avgCheck = userRow.avg_check || 1000;
            const savedNow = Math.max(0, avgCheck - amount);
            await supabase
              .from('user_stats')
              .update({
                total_spent: (userRow.total_spent || 0) + amount,
                purchase_count: (userRow.purchase_count || 0) + 1,
                saved: (userRow.saved || 0) + savedNow,
                state: null
              })
              .eq('chat_id', chatId);
            let responseText = `Покупка на ${amount}₽ учтена!`;
            if (savedNow > 0) responseText += ` Экономия: +${savedNow}₽.`;
            await sendTelegram(chatId, responseText);
          } else {
            await sendTelegram(chatId, "Пожалуйста, введите корректную сумму (например, 950).");
          }
          return res.status(200).send("ok");
        }

        // 3. /стата — показать статистику
        if (userMessage === "/стата" || userMessage === "/stats") {
          if (!userRow) {
            await sendTelegram(chatId, "Пока нет данных о покупках.");
          } else {
            await sendTelegram(chatId,
              `Потрачено: ${userRow.total_spent ?? 0}₽\n` +
              `Покупок: ${userRow.purchase_count ?? 0}\n` +
              `Экономия (примерно): ${userRow.saved ?? 0}₽\n` +
              `Средний чек: ${userRow.avg_check ?? 1000}₽`
            );
          }
          return res.status(200).send("ok");
        }

        // 4. /средний N — сменить средний чек
        if (userMessage.startsWith("/средний")) {
          const match = userMessage.match(/\/средний\s+(\d+)/i);
          if (match) {
            const newAvg = parseInt(match[1]);
            if (newAvg > 0) {
              await supabase
                .from('user_stats')
                .upsert([{ chat_id: chatId, avg_check: newAvg }]);
              await sendTelegram(chatId, `Средний чек теперь ${newAvg}₽`);
            } else {
              await sendTelegram(chatId, "Введите корректное число после /средний (например, /средний 1200)");
            }
          } else {
            await sendTelegram(chatId, "Формат: /средний 1200");
          }
          return res.status(200).send("ok");
        }

        // --- Остальные сообщения идут ассистенту OpenAI ---

        // Получаем/создаем thread для пользователя
        let threadId = threadMap[chatId];
        if (!threadId) {
          const thread = await openai.beta.threads.create();
          threadId = thread.id;
          threadMap[chatId] = threadId;
        }

        // Добавляем сообщение пользователя в thread
        await openai.beta.threads.messages.create(threadId, {
          role: "user",
          content: userMessage,
        });

        // Запускаем ассистента
        const run = await openai.beta.threads.runs.create(threadId, {
          assistant_id: assistantId,
        });

        // Ожидаем завершения run (до 30 сек)
        let runStatus, attempts = 0;
        do {
          await new Promise(res => setTimeout(res, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
          attempts++;
        } while (runStatus.status !== "completed" && attempts < 30);

        let responseText = "Извините, не удалось получить ответ от ассистента.";
        if (runStatus.status === "completed") {
          // Получаем последнее НОВОЕ сообщение ассистента
          const messages = await openai.beta.threads.messages.list(threadId);
          const assistantMessages = messages.data
            .filter(m => m.role === "assistant")
            .sort((a, b) => b.created_at - a.created_at);
          let assistantMessage;
          if (assistantMessages.length > 0) {
            if (lastAssistantMessageId[chatId] !== assistantMessages[0].id) {
              assistantMessage = assistantMessages[0];
              lastAssistantMessageId[chatId] = assistantMessage.id;
            }
          }
          if (assistantMessage) {
            responseText = assistantMessage?.content[0]?.text?.value || responseText;
          } else {
            responseText = "Нет нового ответа от ассистента.";
          }
        }

        await sendTelegram(chatId, responseText);
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

async function sendTelegram(chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
    }),
  });
}
