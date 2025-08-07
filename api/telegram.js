const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))
const { OpenAI } = require("openai")

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

const sessions = new Map()

const personas = {
  strict: "Ты — жёсткий финансовый коуч. Цель: отговорить от покупки без сантиментов. Используй логику, цифры, факты. Будь прямолинеен.",
  soft: "Ты — заботливый, мягкий друг. Помогаешь понять истинные причины желания купить вещь. Акцент на эмоциях и потребностях. Будь добр, но честен.",
  troll: "Ты — дерзкий, язвительный тролль, но с сердцем. Твоя цель — высмеять импульсивную покупку. Шути, поддразни, стебись.",
  wise: "Ты — философ. Помогаешь увидеть бессмысленность желания. Используй парадоксы, образность, метафоры, наблюдения."
}

module.exports = async function (req, res) {
  if (req.method !== 'POST' || req.query.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden')
  }

  const message = req.body?.message?.text
  const chatId = req.body?.message?.chat?.id?.toString()

  if (!message || !chatId) return res.status(400).send('Bad Request')

  const command = message.trim().toLowerCase()

  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      persona: 'soft',
      messages: [],
      totalSaved: 0,
      relapses: 0,
      savedMoney: 0
    })
  }

  const session = sessions.get(chatId)

  if (command === '/start') {
    await sendMessage(chatId, "Привет! Я помогу тебе не делать импульсивные покупки. Напиши, что хочешь купить.")
    return res.status(200).send('ok')
  }

  if (command === '/persona') {
    await sendMessage(chatId, "Выбери стиль:\n/strict — строгий\n/soft — мягкий\n/troll — тролль\n/wise — мудрец")
    return res.status(200).send('ok')
  }

  if (['/strict', '/soft', '/troll', '/wise'].includes(command)) {
    session.persona = command.replace('/', '')
    await sendMessage(chatId, `✅ Стиль сменён на: ${session.persona}`)
    return res.status(200).send('ok')
  }

  if (command === '/done') {
    session.totalSaved += 1
    session.messages = []
    await sendMessage(chatId, "👏 Круто! Я знал, что ты справишься. Запишем победу.")
    return res.status(200).send('ok')
  }

  if (command === '/buy' || command === '/я купил') {
    session.relapses += 1
    session.messages = []
    await sendMessage(chatId, "😔 Бывает. Но в следующий раз удержимся! Напиши, сколько потратил(а).")
    session.awaitingAmount = true
    return res.status(200).send('ok')
  }

  if (command === '/stats') {
    await sendMessage(chatId, `📊 Ты удержался от ${session.totalSaved} покупок\n💸 Потратил: $${session.savedMoney.toFixed(2)}\n😅 Сорвался: ${session.relapses} раз(а)`)
    return res.status(200).send('ok')
  }

  // если ждём сумму после /buy
  if (session.awaitingAmount) {
    const amount = parseFloat(message.replace(/[^0-9.]/g, ''))
    if (!isNaN(amount)) {
      session.savedMoney += amount
      session.awaitingAmount = false
      await sendMessage(chatId, `💾 Сохранил: $${amount.toFixed(2)}. Будем внимательнее в следующий раз!`)
    } else {
      await sendMessage(chatId, "❓ Я не понял сумму. Напиши просто число, например: 35.99")
    }
    return res.status(200).send('ok')
  }

  // обычный диалог — отговариваем
  const personaPrompt = personas[session.persona]
  if (session.messages.length === 0) {
    session.messages.push({ role: 'user', content: `Хочу купить: ${message}` })
  } else {
    session.messages.push({ role: 'user', content: message })
  }

  const fullPrompt = [
    { role: 'system', content: personaPrompt },
    ...session.messages
  ]

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: fullPrompt
  })

  const reply = completion.choices[0].message.content || "🤔 Что-то я задумался..."
  session.messages.push({ role: 'assistant', content: reply })

  await sendMessage(chatId, reply)
  res.status(200).send('ok')
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
}
