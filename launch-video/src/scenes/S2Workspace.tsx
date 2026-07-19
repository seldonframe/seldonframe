import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, C, FONT_MONO} from '../theme';
import {
  Accent,
  Browser,
  BuildLog,
  fade,
  ShotCrop,
  Stamp,
  Stage,
  Title,
  TypeOn,
  useLayout,
} from '../components/core';

/**
 * The magic moment: the sentence from scene 1 → the REAL product.
 * workspace-head.png is a live capture of the "Roofs by Shiloh is live"
 * workspace-ready screen. Left 17% cropped (sidebar + account email).
 */
export const S2Workspace: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();

  const bw = V ? 960 : 1500;
  const bh = V ? 1080 : 680;

  return (
    <Stage>
      <Title at={b(0.5)} size={V ? 66 : 74}>
        One sentence → a <Accent>real hosted workspace.</Accent>
      </Title>

      <Stamp
        at={b(1)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 420 : 196,
          marginLeft: -bw / 2,
        }}
      >
        <Browser
          width={bw}
          height={bh}
          hot
          url={
            <>
              <span style={{color: C.sand}}>●</span>&nbsp;https://
              <TypeOn
                text="roofs-by-shiloh.app.seldonframe.com"
                start={b(1.5)}
                end={b(3.5)}
                caret={frame < b(4)}
                style={{color: C.paper, fontSize: 24}}
              />
            </>
          }
        >
          {/* real product screenshot, sidebar (and its email) cropped out */}
          <div style={{opacity: fade(frame, b(4), 4)}}>
            <ShotCrop
              src="workspace-head.png"
              cw={bw - 4}
              ch={bh - 68}
              iw={1915}
              ih={1028}
              crop={{l: 0.17}}
              zoomFrom={1}
              zoomTo={1.06}
              zoomStart={b(4)}
              zoomEnd={b(15)}
            />
          </div>
        </Browser>
      </Stamp>

      <div
        style={{
          position: 'absolute',
          bottom: V ? 210 : 118,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: V ? 36 : 42,
          fontWeight: 500,
          color: C.sage,
          opacity: fade(frame, b(10), 5),
          padding: '0 90px',
        }}
      >
        Live on a real subdomain.{' '}
        <span style={{color: C.paper, fontWeight: 700}}>No claim step. No key. No guest mode.</span>
      </div>

      <BuildLog
        items={[
          {at: b(5), text: '✓ crm', ok: true},
          {at: b(5.75), text: '✓ calendar', ok: true},
          {at: b(6.5), text: '✓ intake', ok: true},
          {at: b(7.25), text: '✓ ai chatbot', ok: true},
          {at: b(8), text: '✓ public site', ok: true},
        ]}
      />
    </Stage>
  );
};
