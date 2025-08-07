import { Telegraf } from "telegraf";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const assistantId = "asst_lieJntC1Hf4FxU02SkyMIQSq";
const userThreads = new Map(); // userId → threadId

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const message = ctx.message.text;

  // Получаем или создаём thread для пользователя
  let threadId = userThreads.get(userId);
  if (!threadId) {
    const thread = await openai.beta.threads.create();
    threadId = thread.id;
    userThreads.set(userId, threadId);
  }

  // Отправляем сообщение в тред
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: message,
  });

  // Запускаем ран
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  // Ждём завершения
  let runStatus;
  while (true) {
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    if (runStatus.status === "completed") break;
    if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
      ctx.reply("Ошибка: " + runStatus.status);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Получаем и отправляем ответ
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastAssistantMessage = messages.data.find((m) => m.role === "assistant");
  if (lastAssistantMessage) {
    ctx.reply(lastAssistantMessage.content[0].text.value);
  } else {
    ctx.reply("Ассистент не дал ответа.");
  }
});

bot.launch();
console.log("Bot is running!");
