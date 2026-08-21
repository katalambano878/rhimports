import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'RNH Imports — Premium Electronics, Imported for Ghana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #0F1A47 0%, #1B2A6B 50%, #2D3F8A 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: 'rgba(255,255,255,0.9)', display: 'flex' }} />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', marginRight: 10 }} />
            <span style={{ color: '#FFFFFF', fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
              Premium Electronics, Imported for Ghana
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#FFFFFF', fontSize: 72, fontWeight: 700, lineHeight: 1.05, marginBottom: 4 }}>
              RNH Imports
            </span>
          </div>

          <div style={{ width: 80, height: 2, background: '#FFFFFF', marginTop: 24, marginBottom: 24, display: 'flex' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 22, fontWeight: 400 }}>
              +233 594 162 758
            </span>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, fontWeight: 400, marginTop: 4 }}>
              Amasaman, Accra — Ghana
            </span>
          </div>
        </div>

        <div style={{
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.15)',
          borderLeft: '1px solid rgba(255,255,255,0.2)',
          padding: 40,
          gap: 16,
        }}>
          {[
            { icon: '📦', label: 'Direct from China' },
            { icon: '✅', label: 'Zero Counterfeits' },
            { icon: '🚚', label: 'Ghana-wide Delivery' },
            { icon: '💬', label: 'WhatsApp Support' },
          ].map((item) => (
            <div key={item.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
