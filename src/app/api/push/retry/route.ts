import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendPushToUser } from "@/lib/push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const providedSecret = authHeader?.replace("Bearer ", "")

  if (providedSecret && providedSecret === CRON_SECRET) {
    // OK, cron
  } else {
    const { getSession } = await import("@/lib/auth")
    const session = await getSession()
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
  }

  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000)
    const recentNotifications = await db.notification.findMany({
      where: {
        read: false,
        ts: { gt: cutoff },
      },
      include: {
        user: { select: { username: true } },
      },
      take: 50,
    })

    if (recentNotifications.length === 0) {
      return NextResponse.json({ ok: true, retried: 0, msg: "Nessuna notifica recente da ritentare" })
    }

    const byUser = new Map<string, { username: string; notifiche: typeof recentNotifications }>()
    for (const n of recentNotifications) {
      const key = n.userId
      if (!byUser.has(key)) {
        byUser.set(key, { username: n.user.username, notifiche: [] })
      }
      byUser.get(key)!.notifiche.push(n)
    }

    let totalSent = 0
    const results: Array<{ username: string; sent: number }> = []

    for (const [, { username, notifiche }] of byUser) {
      const latest = notifiche[0]
      // Messaggi e richieste upload aprono direttamente la tab Messaggi
      const url =
        latest.type === "messaggio" || latest.type === "richiesta_upload"
          ? "/?tab=messaggi"
          : "/"
      const sent = await sendPushToUser(username, {
        title: getNotifTitle(latest.type),
        body: latest.text.slice(0, 100),
        url,
        tag: "pfc-retry-" + latest.id,
      })
      totalSent += sent
      results.push({ username, sent })
    }

    return NextResponse.json({
      ok: true,
      retried: totalSent,
      usersProcessed: byUser.size,
      details: results,
    })
  } catch (err) {
    console.error("[PUSH retry] errore:", err)
    return NextResponse.json({ error: "Errore server", detail: String(err) }, { status: 500 })
  }
}

function getNotifTitle(type: string): string {
  switch (type) {
    case "messaggio":
      return "Nuovo messaggio"
    case "richiesta_upload":
      return "Richiesta documento"
    case "avviso":
      return "Nuovo avviso dallo studio"
    case "documento_nuovo":
      return "Nuovo documento disponibile"
    case "upload_confermato":
      return "Upload confermato"
    default:
      return "Portale PFC"
  }
}