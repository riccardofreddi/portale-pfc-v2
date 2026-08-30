// Script per testare la struttura del payload FCM (versione JS)
// Esegui con: node test-fcm-payload.js

const payload = {
  title: "Test Notifica",
  body: "Questo è un corpo di test",
  url: "/scadenze",
  data: { docId: "123" }
}

function constructFcmPayload(payload) {
  // Questa logica ricalca esattamente quella in src/lib/fcm.ts
  const fcmMessage = {
    token: "fake-token",
    // Rimuoviamo `notification` come discusso
    data: {
      url: payload.url ?? "/",
      title: payload.title,
      body: payload.body,
      ...Object.fromEntries(
        Object.entries(payload.data ?? {}).map(([k, v]) => [k, String(v)])
      ),
    },
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: "default",
          badge: 1,
        },
      },
    },
  }
  return fcmMessage
}

const result = constructFcmPayload(payload)
console.log(JSON.stringify(result, null, 2))

// Validazione
if (result.notification) {
    console.error("❌ TEST FALLITO: Il payload contiene ancora l'oggetto \"notification\"!")
} else if (!result.data || !result.data.title || !result.data.body) {
    console.error("❌ TEST FALLITO: Il payload \"data\" è mancante o malformato!")
} else {
    console.log("✅ TEST SUPERATO: Il payload è di tipo \"data-only\" correttamente strutturato.")
}
