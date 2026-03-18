'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

import { useEffect, useState } from 'react';

export default function ApiDocsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spec, setSpec] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch('/api/docs')
      .then((res) => res.json())
      .then(setSpec);
  }, []);

  if (!spec) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fafafa' }}>
        <p style={{ fontFamily: 'system-ui', color: '#666' }}>Loading API docs...</p>
      </div>
    );
  }

  return (
    <div className="swagger-wrapper">
      <style>{`
        .swagger-wrapper {
          background: #fafafa;
          min-height: 100vh;
        }
        /* Override swagger-ui theme to match Flaneur branding */
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { font-family: 'Cormorant Garamond', Georgia, serif; }
        .swagger-ui .opblock-tag { font-family: system-ui, -apple-system, sans-serif; }
        .swagger-ui .btn.execute { background: #b45309; border-color: #b45309; }
        .swagger-ui .btn.execute:hover { background: #92400e; }
      `}</style>
      <SwaggerUI spec={spec} />
    </div>
  );
}
