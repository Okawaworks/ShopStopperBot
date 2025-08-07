import { VercelRequest, VercelResponse } from '@vercel/node'
import { Configuration, OpenAIApi } from 'openai'

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }))
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!

const sessions = new Map<string, { persona: string, messages: any[], totalSaved: number, relapses: number }>()

const personas = {
  strict: "Ты — жёсткий финансовый коуч. Цель: отговорить от покупки без сантиментов. Используй логику, цифры, факты. Будь прямолинеен.",
  soft: "Ты — заботливый, мягкий друг. Помогаешь понять истинные причины желания купить вещь. Акцент на эмоциях и потребностях. Будь добр, но честен.",
  troll: "Ты — дерзкий, язвительный тролль, но с сердцем. Твоя цель — высмеять импульсивную покупку.",
  wise: "Ты — философ. Помогаешь увидеть бессмысленность желания. Используй парадоксы, образность, наблюдения."
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' || req.query.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden')
  }

  const message = req.body?.message?.text
  const chatId = req.body?.message?.chat?.id?.toString()

  if (!message || !chatId) return res.status(400).send('Bad Request')

  const command = message.trim().toLowerCase()
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { persona: "soft", messages: [], totalSaved: 0, relapses: 0 })
  }

  const session = sessions.get(chatId)!

  if (command === '/start') {
    await sendMessage(chatId, "Привет! Я помогу тебе не делать импульсивные покупки. Напиши, что хочешь купить.")
    return res.status(200).send('ok')
  }

  if (command === '/done') {
    session.totalSaved += 1
    session.messages = []
    await sendMessage(chatId, "👏 Молодец! Записал — ты удержался от покупки.")
    return res.status(200).send('ok')
  }

  if (command === '/buy' || command === '/я купил') {
    session.relapses += 1
    session.messages = []
    await sendMessage(chatId, "😔 Понимаю. В следующий раз справимся вместе!")
    return res.status(200).send('ok')
  }

  if (command === '/persona') {
    await sendMessage(chatId, "Выбери стиль:\n/strict — строгий\n/soft — мягкий\n/troll — тролль\n/wise — мудрец")
    return res.status(200).send('ok')
  }

  if (['/strict','/soft','/troll','/wise'].includes(command)) {
    session.persona = command.replace('/', '')
    await sendMessage(chatId, `✅ Стиль сменён на: ${session.persona}`)
    return res.status(200).send('ok')
  }

  if (command === '/stats') {
    await sendMessage(chatId, `📊 Ты удержался от ${session.totalSaved} покупок\n😅 Но поддался ${session.relapses} раз(а)`)
    return res.status(200).send('ok')
  }

  // продолжение диалога
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

  const completion = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: fullPrompt
  })

  const reply = completion.data.choices[0].message?.content ?? '🤔 Хм...'
  session.messages.push({ role: 'assistant', content: reply })

  await sendMessage(chatId, reply)
  res.status(200).send('ok')
}

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}
