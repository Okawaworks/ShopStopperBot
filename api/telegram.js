import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = "asst_lieJntC1Hf4FxU02SkyMIQSq";
const threadMap = new Map(); // Храним thread_id для каждого пользователя

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) return;

  try {
    // Получаем или создаём thread для пользователя
    let threadId = threadMap.get(chatId);

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadMap.set(chatId, threadId);
    }

    // Отправляем сообщение в thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Запускаем run
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // Ждём завершения run
    let runStatus;
    while (true) {
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      if (runStatus.status === "completed") break;
      if (runStatus.status === "failed") {
        throw new Error("Run failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Получаем ответ
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find((msg) => msg.role === "assistant");

    if (lastMessage) {
      await bot.sendMessage(chatId, lastMessage.content[0].text.value);
    } else {
      await bot.sendMessage(chatId, "❌ Ошибка: ассистент не ответил.");
    }
  } catch (error) {
    console.error("Ошибка:", error);
    await bot.sendMessage(chatId, "⚠️ Возникла ошибка. Попробуйте позже.");
  }
});
