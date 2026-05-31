/**
 * ShowSql — a disclosure that reveals result.sql in a read-only <pre>.
 * The SQL is hidden unless the user clicks "Show the SQL ›".
 */
import { useState } from 'react';
import type { QueryResult } from '../../contracts';
import { tokens } from '../theme/tokens';

interface ShowSqlProps {
  result: QueryResult;
}

export function ShowSql({ result }: ShowSqlProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ fontFamily: tokens.fontSans, fontSize: 13 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: tokens.lead,
          fontFamily: tokens.fontSans,
          fontSize: 13,
          fontWeight: 500,
        }}
        aria-expanded={open}
      >
        {open ? 'Hide SQL ›' : 'Show the SQL ›'}
      </button>

      {open && (
        <pre
          style={{
            marginTop: 8,
            padding: '10px 14px',
            background: '#1b1b18',
            color: '#d4d0c8',
            fontFamily: tokens.fontMono,
            fontSize: 12,
            borderRadius: 4,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            userSelect: 'text',
          }}
          aria-label="Generated SQL"
          aria-readonly="true"
        >
          {result.sql}
        </pre>
      )}
    </div>
  );
}
