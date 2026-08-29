import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  // Usa lo stesso segreto che già usi per /api/scadenze/check
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 1. Sblocca scadenze
    const result = await db.scadenza.updateMany({
      where: {
        pagata: false,
        dataScadenza: { gte: new Date() },
      },
      data: {
        pushInviata: false,
        emailInviata: false,
        notificata: false,
      },
    });

    return NextResponse.json({
      message: 'Scadenze sbloccate',
      updatedCount: result.count,
    });
  } catch (error) {
    console.error('Errore sblocco:', error);
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
  }
}
