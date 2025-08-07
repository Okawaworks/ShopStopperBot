const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
const botToken = process.env.TELEGRAM_TOKEN;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = "asst_lieJntC1Hf4FxU02SkyMIQSq";
const threadMap = new Map();

let bot;
if (!bot) {
  bot = new TelegramBot(botToken, { webHook: true });
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) return;

  try {
    let threadId = threadMap.get(chatId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadMap.set(chatId, threadId);
    }
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let
