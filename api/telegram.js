const TelegramBot = require("node-telegram-bot-api");

const botToken = process.env.TELEGRAM_TOKEN;
if (!botToken) throw new Error("TELEGRAM_TOKEN is not set!");

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
    console.log("Нет текста в сообщении, игнорируем.");
    return;
  }

  try {
    await bot.sendMessage(chatId, "Бот работает! Ваше сообщение получено: " + userMessage);
    console.log("Ответ отправлен!");
  } catch (e) {
    console.error("Ошибка отправки:", e);
  }
});

module.exports = async (req, res) => {
  try {
    console.log("Webhook вызван:", req.method, req.url);
    if (req.method === "POST") {
      await bot.processUpdate(req.body);
      res.status(200).send("ok");
    } else {
      res.status(200).send("Bot is running (webhook model)");
    }
  } catch (err) {
    console.error("Ошибка в webhook handler:", err);
    res.status(500).send("Internal server error");
  }
};
