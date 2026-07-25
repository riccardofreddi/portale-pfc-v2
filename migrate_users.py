"""
Migrazione utenti dal vecchio Streamlit al nuovo DB Supabase Postgres.
Mantiene le password originali (hash pbkdf2_sha256 compatibili).
"""
import os
import sys
import asyncio

# Installa asyncpg se non presente
try:
    import asyncpg
except ImportError:
    print("Installo asyncpg...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg"])
    import asyncpg

# === CONFIGURAZIONE ===
# Inserisci qui la tua DATABASE_URL di Supabase (la trovi su Vercel > Settings > Environment Variables)
# Formato: postgresql://postgres:PASSWORD@db.larnzxjejygqyqrwgmxr.supabase.co:5432/postgres?pgbouncer=true&prepared_statements=false
DATABASE_URL = os.environ.get("DATABASE_URL", "INSERISCI_QUI_LA_TUA_DATABASE_URL_SUPABASE")

UTENTI_DA_MIGRARE = [
    {
        "username": "adamo",
        "name": "ADAMO DIEGO",
        "password_hash": "pbkdf2_sha256$100000$01e2bbd67f7665d7413ce48a297dfbdf$75fb97a7ff036f2d040e3345bdc2d5a18db008eb0eaf2d24ee5a74710dc0c7a8"
    },
    {
        "username": "duecci",
        "name": "DUECCI SAS DI COLICCHIO ADALBERTA & C",
        "password_hash": "pbkdf2_sha256$100000$ca750191d43555d51396d99f0b283eef$4fce68a0b91f6114a9c847c2bf2a284faf840612031558088b884c9e64b745f0"
    },
    {
        "username": "freddi",
        "name": "FREDDI RICCARDO",
        "password_hash": "pbkdf2_sha256$100000$2b7b010125064d57e0681e376996e20b$783d90d1eca80378cea7d00987f6ee55bac459eb0261a4eac1193de83456c79c"
    },
    {
        "username": "marchionne",
        "name": "MARCHIONNE ANGELO",
        "password_hash": "pbkdf2_sha256$100000$07eafc2247ed7fcf7184677fb5f6ad09$c8417f3ea7a4d222614db544117c771cab3c898b5ff42727956ad68c7ac996e4"
    },
    {
        "username": "picone",
        "name": "PICONE MARIO",
        "password_hash": "pbkdf2_sha256$100000$f403f20043671cf2fd146debaf3b74dc$fadbfbb1194c2f1aade7077e01e372cec2b75cf511b886a9da95b23d632e645a"
    },
    {
        "username": "petrucci",
        "name": "PETRUCCI ALESSANDRO",
        "password_hash": "pbkdf2_sha256$100000$28c5d34a1109f9f8557b99aaaa8f57ca$f87ae3f43f4ea0dbf7454178fc57cdf0968d93cdb6a50e514039b2794a6e76e6"
    },
    {
        "username": "test",
        "name": "test",
        "password_hash": "pbkdf2_sha256$100000$3bf6235e90b73ea342645845df7f3f34$297d655535bd455c2786ab5fc67fe2c6df79d8c94419df5f2d095eb13dc5b44e",
        "exempt": True
    },
]


async def main():
    if "INSERISCI_QUI" in DATABASE_URL:
        print("ERRORE: Devi impostare DATABASE_URL")
        print("Vai su Vercel > portale-pfc-v2 > Settings > Environment Variables")
        print("Copia il valore di DATABASE_URL e impostalo come variabile d'ambiente:")
        print('  PowerShell:  $env:DATABASE_URL = "postgresql://..."')
        print("Oppure modificando direttamente lo script Python.")
        sys.exit(1)

    # Pulisce la URL per asyncpg (rimuove i parametri pgbouncer)
    db_url = DATABASE_URL.split("?")[0]
    print(f"Connessione a: {db_url[:50]}...")

    conn = await asyncpg.connect(db_url)
    print("Connesso al DB Supabase!\n")

    for u in UTENTI_DA_MIGRARE:
        # Verifica se esiste gia'
        existing = await conn.fetchval(
            "SELECT id FROM users WHERE username = $1", u["username"]
        )
        if existing:
            # Aggiorna password e nome
            exempt = u.get("exempt", False)
            await conn.execute(
                "UPDATE users SET password_hash = $1, name = $2, exempt_maintenance = $3 WHERE username = $4",
                u["password_hash"], u["name"], exempt, u["username"]
            )
            print(f"  [AGGIORNATO] {u['username']:<12} - {u['name']}")
        else:
            # Inserisci nuovo
            exempt = u.get("exempt", False)
            await conn.execute(
                """INSERT INTO users (id, username, name, password_hash, role, exempt_maintenance, created_at, updated_at)
                   VALUES (gen_random_uuid(), $1, $2, $3, 'client', $4, NOW(), NOW())""",
                u["username"], u["name"], u["password_hash"], exempt
            )
            print(f"  [INSERITO]   {u['username']:<12} - {u['name']}")

    # Verifica finale
    print("\n=== Utenti nel DB dopo la migrazione ===")
    rows = await conn.fetch("SELECT username, name, role, exempt_maintenance FROM users ORDER BY name")
    for r in rows:
        flag = " [ESENTE]" if r["exempt_maintenance"] else ""
        print(f"  {r['username']:<15} {r['role']:<8} {r['name']}{flag}")

    await conn.close()
    print("\nMigrazione completata!")


if __name__ == "__main__":
    asyncio.run(main())
