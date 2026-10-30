import os
import zipfile
import hashlib

def get_file_hash(filepath):
    if not os.path.exists(filepath):
        return None
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def create_project_zip():
    output_zip = 'public/restaurante-gestao-pedidos.zip'
    os.makedirs('public', exist_ok=True)

    # Diretórios a excluir do pacote distribuível
    exclude_dirs = {
        'node_modules', '.git', 'dist', '.cache', '__pycache__', '.temp', '.idea', '.vscode', 'aistudio', 'images'
    }

    # Arquivos sensíveis, temporários ou auxiliares estritamente proibidos no pacote
    exclude_exact_files = {
        'restaurante-gestao-pedidos.zip',
        '.DS_Store',
        'bun.lockb',
        '.env',
        '.env.local',
        '.env.production',
        '.env.test',
        'database.sqlite-wal',
        'database.sqlite-shm',
        'resumo_e_abstract.md',
        'tg_estrutura_academica_e_referencias.md',
        'galeria-prints.html',
        'capture_real_screenshots.js',
        'run_7_scenarios.js'
    }

    # Validação prévia da integridade dos artefatos essenciais
    log_path = os.path.join('docs', 'test_execution.log')
    if not os.path.exists(log_path):
        print(f"[AVISO] '{log_path}' ainda não foi gerado. Certifique-se de executar os testes antes do pacote final.")

    orig_db = os.path.join('data', 'backups', 'database_original_dev.sqlite')
    post_db7 = os.path.join('data', 'backups', 'database_pos_testes_quadro7.sqlite')
    post_db8 = os.path.join('data', 'backups', 'database_pos_testes_quadro8.sqlite')

    hash_orig = get_file_hash(orig_db)
    hash_post7 = get_file_hash(post_db7)
    hash_post8 = get_file_hash(post_db8)

    if not hash_orig:
        raise RuntimeError(f"FALHA CRÍTICA: Backup original não encontrado em '{orig_db}'. Execute a migração/seed antes de empacotar.")
    if not hash_post7:
        raise RuntimeError(f"FALHA CRÍTICA: Backup pós-testes do Quadro 7 não encontrado em '{post_db7}'. Execute a suíte de aceitação antes de empacotar.")
    if not hash_post8:
        raise RuntimeError(f"FALHA CRÍTICA: Backup pós-testes do Quadro 8 não encontrado em '{post_db8}'. Execute a suíte de aceitação antes de empacotar.")

    if hash_orig == hash_post7:
        raise RuntimeError(
            "FALHA CRÍTICA DE INTEGRIDADE: database_original_dev.sqlite e database_pos_testes_quadro7.sqlite "
            "são idênticos! O banco pós-testes não reflete as alterações do Quadro 7. "
            "Empacotamento abortado para evitar distribuição de artefatos inválidos."
        )

    if hash_post7 != hash_post8:
        raise RuntimeError(
            f"FALHA CRÍTICA DE INTEGRIDADE: database_pos_testes_quadro7.sqlite ({hash_post7}) e "
            f"database_pos_testes_quadro8.sqlite ({hash_post8}) divergem! "
            "O backup pós-testes do Quadro 8 deve ser uma cópia canônica idêntica do Quadro 7. "
            "Empacotamento abortado para evitar distribuição de artefatos inconsistentes."
        )

    print("✔ Verificação de integridade: Backups original e pós-testes (Quadro 7 e 8) validados com hashes canônicos e consistência comprovada.")

    # Executar checkpoint controlado e estritamente verificado sem apagar arquivos do disco
    import sqlite3
    import time
    for root, dirs, files in os.walk('data'):
        for f in files:
            if f.endswith('.sqlite') and not f.endswith('-wal') and not f.endswith('-shm'):
                db_path = os.path.join(root, f)
                checkpoint_ok = False
                last_error = None
                for attempt in range(5):
                    conn = None
                    try:
                        conn = sqlite3.connect(db_path, timeout=10.0)
                        cur = conn.cursor()
                        # Validar explicitamente que o banco está em modo WAL
                        j_mode = cur.execute("PRAGMA journal_mode;").fetchone()
                        mode_str = str(j_mode[0]).lower() if j_mode and len(j_mode) > 0 else ''
                        if mode_str != 'wal':
                            last_error = f"Banco não está em modo WAL (journal_mode='{mode_str}')"
                            continue

                        # TRUNCATE consolida todo o WAL no banco principal e zera o tamanho do WAL
                        res = cur.execute("PRAGMA wal_checkpoint(TRUNCATE);").fetchone()
                        if res and len(res) == 3:
                            busy, log_pages, checkpointed = res
                            # Exigir busy == 0, log >= 0, checkpointed >= 0 e consolidação 100% (checkpointed == log_pages)
                            if busy == 0 and log_pages >= 0 and checkpointed >= 0 and checkpointed == log_pages:
                                checkpoint_ok = True
                                print(f"✔ Checkpoint verificado com sucesso para {db_path} (log={log_pages}, checkpointed={checkpointed}, busy=0, mode=WAL).")
                                break
                            else:
                                last_error = f"Consolidação incompleta, valores negativos ou bloqueada (busy={busy}, log={log_pages}, checkpointed={checkpointed})"
                        else:
                            last_error = f"Retorno ausente ou nulo do PRAGMA wal_checkpoint para {db_path}"
                    except Exception as err:
                        last_error = str(err)
                    finally:
                        if conn:
                            conn.close()
                    time.sleep(0.5)

                if not checkpoint_ok:
                    raise RuntimeError(f"FALHA CRÍTICA NO CHECKPOINT SQLITE em {db_path}: {last_error}. Empacotamento cancelado para preservar integridade dos dados.")

    count = 0
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Filtrar diretórios proibidos
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.') and d != 'aistudio']

            # Evitar pastas de assets do aistudio
            if any(part in exclude_dirs for part in root.split(os.sep)):
                continue

            for file in files:
                # Regra 1: Qualquer arquivo .env que NÃO seja .env.example é proibido
                if file.startswith('.env') and file != '.env.example':
                    continue
                if file.endswith('.env') and file != '.env.example':
                    continue
                if file in exclude_exact_files:
                    continue
                # Bloquear arquivos markdown ou de instrução dentro da pasta public
                if file.endswith('.md') and ('public' in root.split(os.sep) or root.startswith('public')):
                    continue
                if (file.endswith('.zip') or file.endswith('.pyc') or
                    file.endswith('-wal') or file.endswith('-shm') or
                    '.sqlite-wal' in file or '.sqlite-shm' in file or
                    file.endswith('.wal') or file.endswith('.shm')):
                    continue

                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, '.')
                zipf.write(full_path, rel_path)
                count += 1

    # Verificação pós-criação de segurança e integridade
    with zipfile.ZipFile(output_zip, 'r') as check_zip:
        names = check_zip.namelist()
        forbidden_envs = [n for n in names if (n == '.env' or ('.env' in n and not n.endswith('.env.example')))]
        if forbidden_envs:
            raise RuntimeError(f"FALHA DE SEGURANÇA: Arquivo sensível encontrado no ZIP: {forbidden_envs}")
        if '.env.example' not in names:
            raise RuntimeError("FALHA: .env.example ausente no pacote ZIP!")

        forbidden_wals = [n for n in names if '-wal' in n or '-shm' in n or n.endswith('.wal') or n.endswith('.shm')]
        if forbidden_wals:
            raise RuntimeError(f"FALHA: Arquivo temporário SQLite encontrado no ZIP: {forbidden_wals}")

        forbidden_notes = [n for n in names if 'aistudio' in n or (n.startswith('public/') and n.endswith('.md'))]
        if forbidden_notes:
            raise RuntimeError(f"FALHA: Arquivo indevido de instruções ou pasta aistudio encontrado no ZIP: {forbidden_notes}")

        forbidden_aux = [n for n in names if any(aux in n for aux in [
            'resumo_e_abstract.md',
            'tg_estrutura_academica_e_referencias.md',
            'galeria-prints.html',
            'capture_real_screenshots.js',
            'run_7_scenarios.js',
            'src/assets/images'
        ])]
        if forbidden_aux:
            raise RuntimeError(f"FALHA: Arquivo desnecessário/auxiliar encontrado no ZIP: {forbidden_aux}")

        required_files = [
            'src/db/sqlite.ts',
            'package.json',
            'package-lock.json',
            'server.ts',
            'scripts/run_quadro7_acceptance_tests.ts',
            'docs/test_execution.log',
            'docs/documento_7_testes_rastreabilidade.md',
            'data/backups/database_pos_testes_quadro7.sqlite'
        ]
        for req_f in required_files:
            if req_f not in names:
                raise RuntimeError(f"FALHA DE INTEGRIDADE: Arquivo essencial ausente no pacote ZIP: {req_f}")

        print(f"✔ Auditoria do pacote aprovada: 0 segredos (.env excluído, apenas .env.example presente).")
        print(f"✔ Auditoria SQLite: 0 arquivos -wal ou -shm no pacote.")
        print(f"✔ Auditoria de integridade: todos os {len(required_files)} artefatos essenciais presentes no ZIP.")

    size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"✔ Pacote de distribuição criado com sucesso: {output_zip} ({count} arquivos, {size_mb:.2f} MB)")

if __name__ == '__main__':
    create_project_zip()
