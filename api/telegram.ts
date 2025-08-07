import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!

const sessions = new Map<string, { persona: string, messages: any[], totalSaved: number, relapses: number }>()

const personas = {
  strict: "Ты — жёсткий финансовый коуч. Цель: отговорить от покупки без сантиментов. Используй логику, цифры, факты. Будь прямолинеен.",
  soft: "Ты — заботливый, мягкий друг. Помогаешь понять истинные причины желания купить вещь. Акцент на эмоциях и потребностях. Будь добр, но честен.",
  troll: "Ты — дерзкий, язвительный тролль, но с сердцем. Твоя цель — высмеять импульсивную покупку.",
  wise: "Ты — философ. Помогаешь увидеть бессмысленность желания. Используй парадоксы, образность, наблюдения."
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 })

    const body = await req.json()
    const message = body?.message?.text
    const chatId = body?.message?.chat?.id?.toString()

    if (!message || !chatId) return new Response("No message", { status: 200 })

    const command = message.trim().toLowerCase()
    if (!sessions.has(chatId)) {
      sessions.set(chatId, { persona: "soft", messages: [], totalSaved: 0, relapses: 0 })
    }

    const session = sessions.get(chatId)!

    // Команды
    if (command === '/start') {
      await sendMessage(chatId, "Привет! Я помогу тебе не делать импульсивные покупки. Напиши, что хочешь купить.")
      return new Response("ok")
    }

    if (command === '/done') {
      session.totalSaved += 1
      session.messages = []
      await sendMessage(chatId, "👏 Молодец! Записал — ты удержался от покупки.")
      return new Response("ok")
    }

    if (command === '/buy' || command === '/я купил') {
      session.relapses += 1
      session.messages = []
      await sendMessage(chatId, "😔 Понимаю. В следующий раз справимся вместе!")
      return new Response("ok")
    }

    if (command === '/persona') {
      await sendMessage(chatId, "Выбери стиль:\n/strict — строгий\n/soft — мягкий\n/troll — тролль\n/wise — мудрец")
      return new Response("ok")
    }

    if (['/strict', '/soft', '/troll', '/wise'].includes(command)) {
      session.persona = command.replace('/', '')
      await sendMessage(chatId, `✅ Стиль сменён на: ${session.persona}`)
      return new Response("ok")
    }

    if (command === '/stats') {
      await sendMessage(chatId, `📊 Ты удержался от ${session.totalSaved} покупок\n😅 Но поддался ${session.relapses} раз(а)`)
      return new Response("ok")
    }

    // Продолжение диалога
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
      model: 'gpt-4o',
      messages: fullPrompt
    })

    const reply = completion.choices[0].message.content || '🤔 Хм...'
    session.messages.push({ role: 'assistant', content: reply })

    await sendMessage(chatId, reply)
    return new Response("ok")
  } catch (err) {
    console.error("❌ Ошибка в Telegram handler:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
}

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
}
