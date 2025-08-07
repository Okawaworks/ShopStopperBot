const { OpenAI } = require("openai");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const sessions = new Map();

const personas = {
  strict: "Ты — жёсткий финансовый коуч. Говори твёрдо. Без пощады. Используй фразы вроде 'Очнись', 'Хватит тратить', 'Это ловушка маркетинга'.",
  soft: "Ты — добрый друг. Помоги человеку разобраться в себе. Используй эмпатичные фразы и поддержку, но не поддакивай.",
  troll: "Ты — дерзкий тролль. Сарказм, насмешки, добрые подколы. Высмеивай желание купить с юмором.",
  wise: "Ты — дзен-философ. Помоги увидеть бессмысленность потребления. Говори метафорами и парадоксами."
};

module.exports = async (req, res) => {
  if (req.method !== "POST" || req.query.secret !== WEBHOOK_SECRET) {
    return res.status(403).send("Forbidden");
  }

  const message = req.body?.message?.text;
  const chatId = req.body?.message?.chat?.id?.toString();

  if (!message || !chatId) return res.status(400).send("Bad Request");

  const command = message.trim().toLowerCase();

  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      persona: "soft",
      messages: [],
      totalSaved: 0,
      relapses: 0,
      totalSavedAmount: 0,
      pendingPrice: false
    });
  }

  const session = sessions.get(chatId);

  // === PRICE ENTRY ===
  if (session.pendingPrice) {
    const price = parseFloat(message.replace(/[^\d.]/g, ""));
    if (!isNaN(price)) {
      session.totalSavedAmount += price;
      session.pendingPrice = false;
      await sendMessage(chatId, `💰 Отлично! Записал: ты сэкономил ${price} ₽.`);
    } else {
      await sendMessage(chatId, "Не понял, сколько стоила вещь? Напиши сумму в формате: 999");
    }
    return res.status(200).send("ok");
  }

  // === COMMANDS ===
  if (command === "/start") {
    await sendMessage(chatId, "Привет! Я помогу тебе не делать импульсивные покупки. Напиши, что хочешь купить.");
    return res.status(200).send("ok");
  }

  if (command === "/done") {
    session.totalSaved += 1;
    session.messages = [];
    session.pendingPrice = true;
    await sendMessage(chatId, "👏 Молодец! А сколько стоила эта вещь?");
    return res.status(200).send("ok");
  }

  if (command === "/buy" || command === "/я купил") {
    session.relapses += 1;
    session.messages = [];
    await sendMessage(chatId, "😔 Понимаю. В следующий раз справимся вместе!");
    return res.status(200).send("ok");
  }

  if (command === "/persona") {
    await sendMessage(chatId, "Выбери стиль:
/strict — строгий
/soft — мягкий
/troll — тролль
/wise — мудрец");
    return res.status(200).send("ok");
  }

  if (["/strict", "/soft", "/troll", "/wise"].includes(command)) {
    session.persona = command.replace("/", "");
    await sendMessage(chatId, `✅ Стиль сменён на: ${session.persona}`);
    return res.status(200).send("ok");
  }

  if (command === "/stats") {
    await sendMessage(
      chatId,
      `📊 Статистика:
✅ Удержался: ${session.totalSaved} раз(а)
💸 Сэкономлено: ${session.totalSavedAmount} ₽
😅 Поддался: ${session.relapses} раз(а)`
    );
    return res.status(200).send("ok");
  }

  // === CONVERSATION ===
  const personaPrompt = personas[session.persona];
  if (session.messages.length === 0) {
    session.messages.push({ role: "user", content: `Хочу купить: ${message}` });
  } else {
    session.messages.push({ role: "user", content: message });
  }

  const fullPrompt = [{ role: "system", content: personaPrompt }, ...session.messages];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: fullPrompt
  });

  const reply = completion.choices[0].message?.content ?? "🤔 Хм...";
  session.messages.push({ role: "assistant", content: reply });

  await sendMessage(chatId, reply);
  res.status(200).send("ok");
};

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
