#!/usr/bin/env python3
"""Read the macOS WhatsApp business content databases without changing the source.

Produces a portable JSON archive, CSV tables, cached files, and a coverage receipt.
Only content tables are read. Encryption/session stores and binary internals are excluded.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import mimetypes
import re
import shutil
import sqlite3
import zipfile
from collections import Counter
from pathlib import Path

EPOCH = dt.datetime(2001, 1, 1, tzinfo=dt.timezone.utc)


def timestamp(value):
    return (EPOCH + dt.timedelta(seconds=value)).isoformat().replace('+00:00', 'Z') if value else None


def read_tables(root, name, tables):
    # Online backup incorporates committed WAL pages and gives each DB a consistent snapshot.
    source = sqlite3.connect((root / name).as_uri() + '?mode=ro', uri=True)
    snapshot = sqlite3.connect(':memory:')
    source.backup(snapshot)
    source.close()
    snapshot.row_factory = sqlite3.Row
    result = {}
    for table in tables:
        columns = [r[1] for r in snapshot.execute(f'pragma table_info("{table}")')
                   if r[2] != 'BLOB' and r[1] not in ('ZMEDIAURL', 'ZLINKTOKEN')]
        selection = ','.join('"' + c + '"' for c in columns)
        result[table] = [dict(row) for row in snapshot.execute(f'SELECT {selection} FROM "{table}"')]
    snapshot.close()
    return result


def export(root, output, account_name, account_phone):
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    sources = {
        'ChatStorage.sqlite': ['ZWACHATSESSION', 'ZWAMESSAGE', 'ZWAMEDIAITEM', 'ZWAGROUPINFO',
                              'ZWAGROUPMEMBER', 'ZWAPROFILEPUSHNAME', 'ZWAMESSAGEDATAITEM', 'ZWABLACKLISTITEM'],
        'ContactsV2.sqlite': ['ZWAADDRESSBOOKCONTACT'],
        'CallHistory.sqlite': ['ZWAAGGREGATECALLEVENT', 'ZWACDCALLEVENT', 'ZWACDCALLEVENTPARTICIPANT'],
        'Labels.sqlite': ['ZWASMBLABEL', 'Z_1PROXIES', 'ZWASMBLABELEDENTITYPROXY'],
        'Biz/Biz.sqlite': ['ZWABIZPROFILEDATA', 'ZWABIZCATEGORYDATA', 'ZWABIZPROFILEOPTIONSDATA',
                          'ZWABIZSERVICEAREADATA', 'ZWABIZVERIFIEDNAMEDATA', 'ZWABIZBOTDATA'],
        'LID.sqlite': ['ZWAZACCOUNT'],
    }
    raw = {name: read_tables(root, name, tables) for name, tables in sources.items() if (root / name).exists()}
    chatdb = raw['ChatStorage.sqlite']
    accounts = raw.get('LID.sqlite', {}).get('ZWAZACCOUNT', [])
    identity = {str(a['ZIDENTIFIER']).split('@')[0]: a for a in accounts}
    contacts = []
    contact_lookup = {}
    for row in raw.get('ContactsV2.sqlite', {}).get('ZWAADDRESSBOOKCONTACT', []):
        item = {'id': str(row['Z_PK']), 'name': row['ZFULLNAME'] or row['ZBUSINESSNAME'] or '',
                'phone': row['ZPHONENUMBER'] or '', 'whatsappId': row['ZWHATSAPPID'],
                'lid': row['ZLID'], 'businessName': row['ZBUSINESSNAME'], 'about': row['ZABOUTTEXT'],
                'notes': row['ZNOTES']}
        contacts.append(item)
        for key in [row['ZPHONENUMBER'], row['ZWHATSAPPID'], row['ZLID']]:
            if key:
                contact_lookup[str(key).split('@')[0].lstrip('+')] = item

    def resolve(jid):
        key = str(jid or '').split('@')[0]
        account = identity.get(key, {})
        phone = account.get('ZPHONENUMBER') or (key if str(jid).endswith('@s.whatsapp.net') else '')
        phone = str(phone).split('@')[0].lstrip('+')
        contact = contact_lookup.get(key) or contact_lookup.get(phone) or {}
        return ('+' + phone if phone.isdigit() and phone != '0' else ''), contact

    files = []
    source_path_to_file = {}
    # Include existing message files and cached profile pictures; never fetch remote media URLs.
    for subdir in ['Message/Media', 'Media/Profile']:
        folder = root / subdir
        if not folder.exists():
            continue
        for path in sorted(folder.rglob('*')):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(root).as_posix()
            content = path.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            identifier = hashlib.sha256(relative.encode()).hexdigest()[:24]
            mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            if content.startswith(b'\xff\xd8\xff'):
                mime = 'image/jpeg'
            elif content.startswith(b'\x89PNG'):
                mime = 'image/png'
            filename = identifier + path.suffix
            (output / 'files').mkdir(exist_ok=True, mode=0o700)
            shutil.copyfile(path, output / 'files' / filename)
            item = {'id': identifier, 'name': path.name, 'path': relative, 'storedName': filename,
                    'bytes': len(content), 'sha256': digest, 'mime': mime,
                    'category': 'profile' if subdir == 'Media/Profile' else 'message'}
            files.append(item)
            source_path_to_file[relative] = item
            if relative.startswith('Message/'):
                source_path_to_file[relative[len('Message/'):]] = item
    media = {row['Z_PK']: row for row in chatdb['ZWAMEDIAITEM']}
    messages = []
    for row in chatdb['ZWAMESSAGE']:
        attachment = media.get(row['ZMEDIAITEM'], {})
        local_path = attachment.get('ZMEDIALOCALPATH')
        file = source_path_to_file.get(local_path)
        card_or_mime = attachment.get('ZVCARDSTRING') or ''
        media_mime = card_or_mime if re.fullmatch(r'[a-z0-9.+-]+/[a-z0-9.+-]+', card_or_mime) else None
        media_title = attachment.get('ZTITLE') or ''
        caption = '' if re.fullmatch(r'[A-Fa-f0-9]{20,}', media_title) else media_title
        messages.append({'id': str(row['Z_PK']), 'sourceId': row['ZSTANZAID'],
                         'chatId': str(row['ZCHATSESSION']), 'sentAt': timestamp(row['ZMESSAGEDATE']),
                         'direction': 'outgoing' if row['ZISFROMME'] else 'incoming',
                         'sender': row['ZFROMJID'], 'recipient': row['ZTOJID'],
                         'senderName': row['ZPUSHNAME'], 'typeCode': row['ZMESSAGETYPE'],
                         'text': row['ZTEXT'] or '', 'starred': bool(row['ZSTARRED']),
                         'statusCode': row['ZMESSAGESTATUS'], 'replyToId': str(row['ZPARENTMESSAGE']) if row['ZPARENTMESSAGE'] else None,
                         'caption': caption, 'mediaMime': media_mime,
                         'contactCard': card_or_mime if 'BEGIN:VCARD' in card_or_mime else None,
                         'latitude': attachment.get('ZLATITUDE'), 'longitude': attachment.get('ZLONGITUDE'),
                         'fileId': file['id'] if file else None,
                         'fileName': file['name'] if file else None,
                         'mediaId': str(attachment['Z_PK']) if attachment else None})
    messages.sort(key=lambda m: (m['sentAt'] or '', int(m['id'])))
    grouped = {}
    for message in messages:
        grouped.setdefault(message['chatId'], []).append(message)
    chats = []
    for row in chatdb['ZWACHATSESSION']:
        identifier = str(row['Z_PK'])
        phone, contact = resolve(row['ZCONTACTJID'])
        history = grouped.get(identifier, [])
        chats.append({'id': identifier, 'jid': row['ZCONTACTJID'],
                      'name': row['ZPARTNERNAME'] or contact.get('name') or phone or row['ZCONTACTJID'] or 'Unknown',
                      'phone': phone, 'contactId': contact.get('id'),
                      'archived': bool(row['ZARCHIVED']), 'hidden': bool(row['ZHIDDEN']),
                      'removed': bool(row['ZREMOVED']), 'typeCode': row['ZSESSIONTYPE'],
                      'unreadCount': row['ZUNREADCOUNT'] or 0, 'messageCount': len(history),
                      'firstMessageAt': history[0]['sentAt'] if history else None,
                      'lastMessageAt': history[-1]['sentAt'] if history else timestamp(row['ZLASTMESSAGEDATE']),
                      'lastText': ((history[-1]['text'] or history[-1]['caption'] or ('Attachment' if history[-1]['mediaMime'] else 'Non-text record')) if history else ''), 'draft': row['ZSAVEDINPUT']})
    chats.sort(key=lambda c: c['lastMessageAt'] or '', reverse=True)
    calldb = raw.get('CallHistory.sqlite', {})
    aggregates = {r['Z_PK']: r for r in calldb.get('ZWAAGGREGATECALLEVENT', [])}
    participants = calldb.get('ZWACDCALLEVENTPARTICIPANT', [])
    calls = []
    for row in calldb.get('ZWACDCALLEVENT', []):
        aggregate = aggregates.get(row['Z1CALLEVENTS'], {})
        jids = [p['ZJIDSTRING'] for p in participants if p['Z1PARTICIPANTS'] == row['Z_PK']]
        calls.append({'id': str(row['Z_PK']), 'at': timestamp(row['ZDATE']),
                      'direction': 'incoming' if aggregate.get('ZINCOMING') else 'outgoing',
                      'missed': bool(aggregate.get('ZMISSED')), 'video': bool(aggregate.get('ZVIDEO')),
                      'durationSeconds': row['ZDURATION'], 'outcomeCode': row['ZOUTCOME'],
                      'participants': [resolve(jid)[0] or jid for jid in jids]})
    labels = raw.get('Labels.sqlite', {}).get('ZWASMBLABEL', [])
    businesses = raw.get('Biz/Biz.sqlite', {}).get('ZWABIZPROFILEDATA', [])
    verified_names = {r['ZJID']: r['ZNAME'] for r in raw.get('Biz/Biz.sqlite', {}).get('ZWABIZVERIFIEDNAMEDATA', [])}
    businesses = [{**b, 'displayName': verified_names.get(b['ZJID'], '')} for b in businesses]
    chat_ids = {c['id'] for c in chats}
    quality = {'duplicateMessageIds': len(messages) - len({m['id'] for m in messages}),
               'messagesWithoutChat': sum(m['chatId'] not in chat_ids for m in messages),
               'chatsWithoutMessages': sum(not c['messageCount'] for c in chats),
               'messagesWithoutTimestamp': sum(not m['sentAt'] for m in messages),
               'messagesWithText': sum(bool(m['text']) for m in messages),
               'messagesWithLocalFile': sum(bool(m['fileId']) for m in messages),
               'photoRecordsWithoutLocalFile': sum(m['typeCode'] == 1 and not m['fileId'] for m in messages),
               'sourceMessageTypes': dict(Counter(str(m['typeCode']) for m in messages)),
               'sourceCounts': {db: {t: len(rows) for t, rows in tables.items()} for db, tables in raw.items()}}
    manifest = {'schemaVersion': 1, 'exportedAt': dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z'),
                'source': 'WhatsApp macOS local content databases',
                'account': {'name': account_name, 'phone': account_phone}, 'displayTimezone': 'Indian/Mauritius',
                'firstMessageAt': messages[0]['sentAt'] if messages else None,
                'lastMessageAt': messages[-1]['sentAt'] if messages else None,
                'counts': {'chats': len(chats), 'messages': len(messages), 'contacts': len(contacts),
                           'calls': len(calls), 'businessProfiles': len(businesses), 'labels': len(labels),
                           'files': len(files), 'fileBytes': sum(f['bytes'] for f in files)},
                'limitations': [
                    'This is the history stored on this Mac. Completeness against the phone and WhatsApp servers is not verified.',
                    'Most media originals are not cached on this Mac. Available files and profile thumbnails are preserved; missing originals cannot be reconstructed from this snapshot.',
                    'No label records were present in the local labels database. Phone-only labels, catalog products, quick replies and settings may be absent.',
                    'Messages include system events. Source type/status codes are preserved; message counts are not order or customer counts.',
                    'Database snapshots are consistent per database, but the separate databases are not captured in one atomic transaction.',
                    'Authentication databases, encryption keys, remote media access URLs and opaque binary internals are excluded. Visible text, captions, contact cards and available files are preserved.',
                ], 'quality': quality}
    archive = {'manifest': manifest, 'chats': chats, 'messages': messages, 'contacts': contacts,
               'calls': sorted(calls, key=lambda c: c['at'] or '', reverse=True),
               'businesses': businesses, 'labels': labels, 'files': files, 'sourceRecords': raw}
    (output / 'archive.json').write_text(json.dumps(archive, ensure_ascii=False), encoding='utf-8')
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    for name in ['chats', 'messages', 'contacts', 'calls', 'businesses', 'files']:
        rows = archive[name]
        if rows:
            with (output / (name + '.csv')).open('w', newline='', encoding='utf-8-sig') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                for row in rows:
                    # Spreadsheet-safe text; exact originals remain in JSON.
                    writer.writerow({k: ("'" + v if isinstance(v, str) and v[:1] in '=+-@\t\r' else v) for k, v in row.items()})
    receipt = '# WhatsApp Business extraction\n\n' + json.dumps(manifest['counts'], indent=2) + '\n\n'
    receipt += 'Coverage: ' + str(manifest['firstMessageAt']) + ' to ' + str(manifest['lastMessageAt']) + ' (UTC).\n\n'
    receipt += '\n'.join('- ' + item for item in manifest['limitations'])
    receipt += '\n\nQuality checks:\n\n```json\n' + json.dumps(quality, indent=2) + '\n```\n'
    (output / 'README.md').write_text(receipt)
    with zipfile.ZipFile(output.with_suffix('.zip'), 'w', zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                bundle.write(path, path.relative_to(output))
    print(json.dumps({'counts': manifest['counts'], 'coverage': [manifest['firstMessageAt'], manifest['lastMessageAt']],
                      'quality': {k: v for k, v in quality.items() if k not in ['sourceCounts', 'sourceMessageTypes']}}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--account-name', required=True)
    parser.add_argument('--account-phone', required=True)
    args = parser.parse_args()
    export(args.source.resolve(), args.output.resolve(), args.account_name, args.account_phone)
