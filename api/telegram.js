const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const botToken = process.env.TELEGRAM_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_lieJntC1Hf4FxU02SkyMIQSq";
const threadMap = new Map();

if (!botToken) {
  throw new Error("TELEGRAM_TOKEN is not set in environment variables!");
}
if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY is not set in environment variables!");
}

const openai = new OpenAI({ apiKey: openaiApiKey });

// Используем глобальный объект для хранения TelegramBot между инстансами (для serverless)
let bot = global._telegramBot;
if (!bot) {
  bot = new TelegramBot(botToken, { webHook: true });
  global._telegramBot = bot;
  console.log("TelegramBot создан");
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  console.log("Получено сообщение:", { chatId, userMessage });

  if (!userMessage) {
    console.log("Сообщение без текста, игнорируется.");
    return;
  }

  try {
    // Получаем/создаём thread для этого чата
    let threadId = threadMap.get(chatId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadMap.set(chatId, threadId);
      console.log("Создан новый thread для чата:", chatId, threadId);
    }

    // Добавляем сообщение пользователя
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });
    console.log("Сообщение пользователя добавлено в thread:", threadId);

    // Запускаем run
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    console.log("Run запущен:", run.id);

    // Ожидаем завершения run (max 30 сек)
    let runStatus, attempts = 0;
    do {
      await new Promise(res => setTimeout(res, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
      console.log("Проверка статуса run:", runStatus.status);
    } while (runStatus.status !== "completed" && attempts < 30);

    if (runStatus.status === "completed") {
      const messages = await openai.beta.threads.messages.list(threadId);
      const assistantMessage = messages.data.reverse().find(m => m.role === "assistant");
      const text = assistantMessage?.content[0]?.text?.value || "Ответ ассистента не найден.";
      await bot.sendMessage(chatId, text);
      console.log("Ответ ассистента отправлен:", text);
    } else {
      await bot.sendMessage(chatId, "Извините, не удалось получить ответ от ассистента (timeout).");
      console.log("Ответ ассистента не получен вовремя (timeout).");
    }
  } catch (err) {
    console.error("Ошибка обработки сообщения:", err);
    try {
      await bot.sendMessage(chatId, "Произошла ошибка при обработке вашего сообщения.");
    } catch (e) {
      console.error("Ошибка при отправке сообщения об ошибке:", e);
    }
  }
});

// Vercel Serverless Function Handler (Webhook)
module.exports = async (req, res) => {
  try {
    console.log("Webhook вызван:", req.method, req.url);
    if (req.method === "POST") {
      // Для Vercel req.body уже распарсен (если не настроено иначе)
      await bot.processUpdate(req.body);
      res.status(200).send("ok");
    } else {
      // Проверка работоспособности endpoint
      res.status(200).send("Bot is running (webhook model)");
    }
  } catch (err) {
    console.error("Ошибка в webhook handler:", err);
    res.status(500).send("Internal server error");
  }
};
