// GET /api/wa/stream — SSE endpoint for real-time updates
// Polls DB every 2s for new messages since last seen timestamp.
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req) {
  const a = requireAuth(req); if (a instanceof Response) return a;

  const encoder = new TextEncoder();
  let interval;
  let lastSentAt = new Date().toISOString();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      interval = setInterval(async () => {
        if (closed) return;
        try {
          const msgs = await prisma.waMessage.findMany({
            where: { sentAt: { gt: lastSentAt } },
            orderBy: { sentAt: 'asc' },
            take: 50,
            select: {
              id: true,
              normalizedPhone: true,
              direction: true,
              source: true,
              content: true,
              sentAt: true,
              aiBlocked: true,
              aiTokensIn: true,
              aiTokensOut: true,
              aiCostUsd: true,
            },
          });

          if (msgs.length > 0) {
            lastSentAt = msgs[msgs.length - 1].sentAt;
            for (const msg of msgs) {
              msg.sentAt = msg.sentAt?.toISOString?.() || msg.sentAt;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'message', data: msg })}\n\n`));
            }
          }

          // Push WA status every cycle
          const workerPort = process.env.WA_WORKER_PORT || 3011;
          try {
            const statusRes = await fetch(`http://127.0.0.1:${workerPort}/status`, {
              headers: { 'x-worker-token': process.env.WA_WORKER_TOKEN || '' },
            });
            if (statusRes.ok) {
              const status = await statusRes.json();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', data: status })}\n\n`));
            }
          } catch {}
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`));
        }
      }, 2000);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
