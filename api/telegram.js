const fetch = require("node-fetch");
const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');

const botToken = process.env.TELEGRAM_TOKEN;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_lieJntC1Hf4FxU02SkyMIQSq";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const threadMap = {};
const lastAssistantMessageId = {};

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      const body = req.body;
      if (body && body.message && body.message.chat && body.message.text) {
        const chatId = body.message.chat.id;
        const userMessage = body.message.text.trim();

        // --- Статистика покупок через Supabase ---
        if (userMessage === "/купил") {
          await sendTelegram(chatId, "На какую сумму купили?");
          await supabase
            .from('user_stats')
            .upsert([{ chat_id: chatId }], { onConflict: 'chat_id' });
          await supabase
            .from('user_stats')
            .update({ state: "waiting_for_amount" })
            .eq('chat_id', chatId);
          return res.status(200).send("ok");
        }

        // Проверяем состояние пользователя (ждет сумму)
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

        // /стата — показать статистику
        if (userMessage === "/стата" || userMessage === "/stats") {
          if (!userRow) {
            await sendTelegram(chatId, "Пока нет данных о покупках.");
          } else {
            await sendTelegram(chatId,
              `Потрачено: ${userRow.total_spent ?? 0}₽\n` +
              `Покупок: ${userRow.purchase_count ?? 0}\n` +
              `Экономия (примерно): ${userRow.saved ?? 0}₽\n` +
             
