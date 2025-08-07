const fetch = require("node-fetch");

const botToken = process.env.TELEGRAM_TOKEN;

module.exports = async (req, res) => {
  try {
    console.log("Webhook вызван:", req.method, req.url);
    if (req.method === "POST") {
      const body = req.body;
      console.log("Получено тело:", body);
      if (body && body.message && body.message.chat && body.message.text) {
        const chatId = body.message.chat.id;
        const userMessage = body.message.text;
        console.log("Получено сообщение:", { chatId, userMessage });

        // Формируем ответ
        const responseText = "Vercel + fetch: ваше сообщение получено: " + userMessage;

        // Отправляем сообщение через Telegram API напрямую
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const tgRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
          }),
        });
        const data = await tgRes.json();
        console.log("Ответ Telegram (fetch):", data);
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
