const { Configuration, OpenAI } = require("openai");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const sessions = new Map();


const personas = {
  strict: "Ты — жёсткий финансовый коуч. Цель: отговорить от покупки без сантиментов. Используй логику, цифры, факты. Будь прямолинеен.",
  soft: "Ты — заботливый, мягкий друг. Помогаешь понять истинные причины желания купить вещь. Акцент на эмоциях и потребностях. Будь добр, но честен.",
  troll: "Ты — дерзкий, язвительный тролль, но с сердцем. Твоя цель — высмеять импульсивную покупку.",
  wise: "Ты — философ. Помогаешь увидеть бессмысленность желания. Используй парадоксы, образность, наблюдения."
};

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const secret = searchParams.get("secret");
    if (secret !== WEBHOOK_SECRET) return res.status(403).send("Forbidden");

    const body = req.body;
    const message = body?.message?.text;
    const chatId = body?.message?.chat?.id?.toString();

    if (!message || !chatId) return res.status(200).send("No message");

    const command = message.trim().toLowerCase();
    if (!sessions.has(chatId)) {
      sessions.set(chatId, { persona: "soft", messages: [], totalSaved: 0, relapses: 0 });
    }

    const session = sessions.get(chatId);

    if (command === "/start") {
      await sendMessage(chatId, "Привет! Я помогу тебе не делать импульсивные покупки. Напиши, что хочешь купить.");
      return res.status(200).send("ok");
    }

    if (command === "/done") {
      session.totalSaved += 1;
      session.messages = [];
      await sendMessage(chatId, "👏 Молодец! Записал — ты удержался от покупки.");
      return res.status(200).send("ok");
    }

    if (command === "/buy" || command === "/я купил") {
      session.relapses += 1;
      session.messages = [];
      await sendMessage(chatId, "😔 Понимаю. В следующий раз справимся вместе!");
      return res.status(200).send("ok");
    }

    if (command === "/persona") {
      await sendMessage(chatId, "Выбери стиль:\n/strict — строгий\n/soft — мягкий\n/troll — тролль\n/wise — мудрец");
      return res.status(200).send("ok");
    }

    if (["/strict", "/soft", "/troll", "/wise"].includes(command)) {
      session.persona = command.replace("/", "");
      await sendMessage(chatId, `✅ Стиль сменён на: ${session.persona}`);
      return res.status(200).send("ok");
    }

    if (command === "/stats") {
      await sendMessage(chatId, `📊 Ты удержался от ${session.totalSaved} покупок\n😅 Но поддался ${session.relapses} раз(а)`);
      return res.status(200).send("ok");
    }

    const personaPrompt = personas[session.persona];
    if (session.messages.length === 0) {
      session.messages.push({ role: "user", content: `Хочу купить: ${message}` });
    } else {
      session.messages.push({ role: "user", content: message });
    }

    const fullPrompt = [
      { role: "system", content: personaPrompt },
      ...session.messages
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: fullPrompt
    });

    const reply = completion.choices[0].message.content || "🤔 Хм...";
    session.messages.push({ role: "assistant", content: reply });

    await sendMessage(chatId, reply);
    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Ошибка в Telegram handler:", err);
    return res.status(500).send("Internal Server Error");
  }
};

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
