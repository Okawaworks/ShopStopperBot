const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const botToken = process.env.TELEGRAM_TOKEN;
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_lieJntC1Hf4FxU02SkyMIQSq";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const threadMap = new Map();

if (!botToken) {
  throw new Error("TELEGRAM_TOKEN is not set in environment variables!");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables!");
}

let bot;
if (!bot) {
  bot = new TelegramBot(botToken, { webHook: true });
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) return;

  try {
    // Thread per chat
    let threadId = threadMap.get(chatId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadMap.set(chatId, threadId);
    }

    // Add user message
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Start run
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // Wait for completion (max 30s)
    let runStatus, attempts = 0;
    do {
      await new Promise(res => setTimeout(res, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
    } while (runStatus.status !== "completed" && attempts < 30);

    if (runStatus.status === "completed") {
      const messages = await openai.beta.threads.messages.list(threadId);
      const assistantMessage = messages.data.reverse().find(m => m.role === "assistant");
      const text = assistantMessage?.content[0]?.text?.value || "Ответ ассистента не найден.";
      bot.sendMessage(chatId, text);
    } else {
      bot.sendMessage(chatId, "Извините, не удалось получить ответ от ассистента (timeout).");
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "Произошла ошибка при обработке вашего сообщения.");
  }
});

// Vercel Serverless Function Handler (Webhook)
module.exports = (req, res) => {
  // Только POST-запросы — Telegram webhook
  if (req.method === "POST") {
    bot.processUpdate(req.body);
    res.status(200).send("ok");
  } else {
    // Проверка работоспособности
    res.status(200).send("Bot is running (webhook model)");
  }
};
