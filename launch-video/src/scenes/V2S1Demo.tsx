import React from 'react';
import {Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, ShotCrop, Stamp, useLayout} from '../components/core';
import {BrowserL, Cursor, LogRowL, StageL} from '../components/light';

/**
 * The money scene: a real visitor on the REAL Metro Medspa site
 * (metro-medspa-9d24.app.seldonframe.com, live capture) clicks the real
 * chatbot, books a HydraFacial, and the booking lands in Google Calendar.
 * Widget rebuilt in React from the live widget (gold header, "Powered by
 * SeldonFrame"); calendar rebuilt in React (Trope method — no screen recording).
 */

const CUT_TO_CAL = b(16);

const GOLD = '#A98A5B';

const Widget: React.FC<{open: number}> = ({open}) => {
  const frame = useCurrentFrame();
  const w = 400;
  const vis = frame >= open;
  const pop = interpolate(frame, [open, open + 8], [0.6, 1], {
    easing: Easing.bezier(0.2, 0.9, 0.3, 1.15),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const msg1 = open + b(1.5); // visitor asks
  const typing = open + b(3.2); // agent typing dots
  const msg2 = open + b(4.2); // agent replies + chips
  const picked = open + b(7); // visitor picks 2:00
  const confirm = open + b(8); // confirmation card

  const bubble = (side: 'l' | 'r', at: number, children: React.ReactNode, hot?: boolean) => (
    <div
      style={{
        display: 'flex',
        justifyContent: side === 'r' ? 'flex-end' : 'flex-start',
        margin: '10px 14px',
        opacity: fade(frame, at, 4),
        transform: `translateY(${(1 - fade(frame, at, 5)) * 10}px)`,
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          padding: '12px 16px',
          borderRadius: 14,
          fontSize: 19,
          lineHeight: 1.45,
          background: hot ? GOLD : side === 'r' ? '#EFE9DD' : '#FFFFFF',
          color: hot ? '#FFFDFA' : '#2A241C',
          border: hot ? 'none' : '1px solid #E7DFD2',
          boxShadow: '0 2px 8px rgba(34,29,23,.06)',
        }}
      >
        {children}
      </div>
    </div>
  );

  if (!vis) return null;
  return (
    <div
      style={{
        position: 'absolute',
        right: 26,
        bottom: 96,
        width: w,
        height: 520,
        borderRadius: 14,
        background: '#FAF7F1',
        boxShadow: '0 24px 70px rgba(34,29,23,.3)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: `scale(${pop})`,
        transformOrigin: 'bottom right',
        opacity: fade(frame, open, 3),
      }}
    >
      <div
        style={{
          background: GOLD,
          color: '#FFFDFA',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            background: 'rgba(255,253,250,.25)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 16,
          }}
        >
          M
        </div>
        Metro Medspa
      </div>

      {/* chat auto-scroll: clip at the header, slide an inner stack up */}
      <div style={{flex: 1, overflow: 'hidden'}}>
      <div
        style={{
          paddingTop: 8,
          transform: `translateY(${interpolate(frame, [confirm - 4, confirm + 6], [0, -140], {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}px)`,
        }}
      >
        {bubble('l', open + 4, 'Hi! How can I help you today?')}
        {bubble('r', msg1, 'Do you have anything Thursday afternoon for a HydraFacial?')}
        {frame >= typing && frame < msg2
          ? bubble('l', typing, <span style={{letterSpacing: 3}}>● ● ●</span>)
          : null}
        {frame >= msg2
          ? bubble('l', msg2, 'Yes — Thursday works. I have 2:00 PM or 4:30 PM with Dana. Which is better?')
          : null}
        {/* quick replies */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            margin: '4px 14px',
            opacity: frame >= confirm ? 0.35 : fade(frame, msg2 + 6, 4),
          }}
        >
          {['Thu 2:00 PM', 'Thu 4:30 PM'].map((t, i) => (
            <div
              key={t}
              style={{
                padding: '9px 16px',
                borderRadius: 999,
                border: `1.5px solid ${GOLD}`,
                color: i === 0 && frame >= picked ? '#FFFDFA' : GOLD,
                background: i === 0 && frame >= picked ? GOLD : 'transparent',
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              {t}
            </div>
          ))}
        </div>
        {frame >= confirm
          ? bubble(
              'l',
              confirm,
              <span>
                <b>✓ Booked — HydraFacial</b>
                <br />
                Thursday · 2:00 PM · with Dana
                <br />
                <span style={{opacity: 0.75, fontSize: 17}}>Confirmation texted to you.</span>
              </span>,
              true
            )
          : null}
      </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: '#B0A692',
          padding: '8px 0 10px',
          fontFamily: FONT_MONO,
        }}
      >
        Powered by SeldonFrame
      </div>
    </div>
  );
};

const GCal: React.FC<{from: number}> = ({from}) => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();
  const days = ['MON 20', 'TUE 21', 'WED 22', 'THU 23', 'FRI 24', 'SAT 25', 'SUN 26'];
  const hours = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'];
  const evt = from + b(1.5);
  const pop = interpolate(frame, [evt, evt + 9], [0.5, 1], {
    easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const gridTop = 130;
  const colW = (W - (V ? 90 : 160)) / 7;
  const rowH = (H - gridTop - (V ? 320 : 150)) / hours.length;

  return (
    <div style={{position: 'absolute', inset: 0, background: '#FFFFFF', opacity: fade(frame, from, 5)}}>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '26px 40px',
          borderBottom: '1px solid #DADCE0',
        }}
      >
        <Img src={staticFile('logo-gcal.svg')} style={{width: 52, height: 52}} />
        <span style={{fontSize: 36, color: '#3C4043', fontWeight: 500}}>Calendar</span>
        <span
          style={{
            marginLeft: 26,
            border: '1px solid #DADCE0',
            borderRadius: 6,
            padding: '8px 18px',
            fontSize: 22,
            color: '#3C4043',
          }}
        >
          Today
        </span>
        <span style={{fontSize: 28, color: '#3C4043', marginLeft: 14}}>July 2026</span>
        {/* sync toast */}
        <div
          style={{
            marginLeft: 'auto',
            background: '#1F2B24',
            color: '#F6F2EA',
            borderRadius: 10,
            padding: '12px 22px',
            fontSize: 21,
            fontFamily: FONT_MONO,
            opacity: fade(frame, evt + 10, 5),
          }}
        >
          ✓ synced from metro-medspa
        </div>
      </div>

      {/* day headers */}
      {days.map((d, i) => (
        <div
          key={d}
          style={{
            position: 'absolute',
            top: gridTop - 36,
            left: (V ? 70 : 130) + i * colW,
            width: colW,
            textAlign: 'center',
            fontSize: 20,
            color: d.startsWith('THU') ? '#1a73e8' : '#70757A',
            fontWeight: d.startsWith('THU') ? 700 : 400,
          }}
        >
          {d}
        </div>
      ))}

      {/* hour rows */}
      {hours.map((hLabel, i) => (
        <React.Fragment key={hLabel}>
          <div
            style={{
              position: 'absolute',
              top: gridTop + i * rowH - 12,
              left: V ? 8 : 40,
              fontSize: 18,
              color: '#70757A',
            }}
          >
            {hLabel}
          </div>
          <div
            style={{
              position: 'absolute',
              top: gridTop + i * rowH,
              left: V ? 70 : 130,
              right: V ? 20 : 30,
              height: 1,
              background: '#E8EAED',
            }}
          />
        </React.Fragment>
      ))}
      {/* column lines */}
      {days.map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: gridTop,
            left: (V ? 70 : 130) + i * colW,
            width: 1,
            bottom: V ? 320 : 150,
            background: '#E8EAED',
          }}
        />
      ))}

      {/* the booked event — Thursday 2 PM */}
      {frame >= evt ? (
        <div
          style={{
            position: 'absolute',
            top: gridTop + 5 * rowH + 2,
            left: (V ? 70 : 130) + 3 * colW + 4,
            width: colW - 10,
            height: rowH - 6,
            background: '#1a73e8',
            borderRadius: 8,
            color: '#fff',
            padding: '8px 12px',
            fontSize: 19,
            lineHeight: 1.35,
            transform: `scale(${pop})`,
            boxShadow: '0 8px 24px rgba(26,115,232,.4)',
          }}
        >
          <b>HydraFacial — Maya R.</b>
          <br />
          2:00 – 3:00 PM · Dana
        </div>
      ) : null}
    </div>
  );
};

export const V2S1Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();

  const bw = V ? 1020 : 1660;
  const bh = V ? 1240 : 940;
  const open = b(5);

  // camera: gentle push toward the widget once it opens
  const zoom = interpolate(frame, [open - 6, open + 24], [1, V ? 1.18 : 1.42], {
    easing: Easing.bezier(0.4, 0, 0.2, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const inCal = frame >= CUT_TO_CAL;

  return (
    <StageL>
      {!inCal ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: V ? 170 : 52,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: FONT_MONO,
              fontSize: V ? 26 : 27,
              letterSpacing: '0.22em',
              color: L.faint,
              opacity: fade(frame, 4, 4),
            }}
          >
            A REAL CLIENT SITE · A REAL VISITOR
          </div>
          <Stamp
            at={2}
            style={{
              position: 'absolute',
              left: '50%',
              top: V ? 300 : 120,
              marginLeft: -bw / 2,
            }}
          >
            <div style={{transform: `scale(${zoom})`, transformOrigin: '82% 78%'}}>
              <BrowserL
                width={bw}
                height={bh}
                url={<span>metro-medspa-9d24.app.seldonframe.com</span>}
              >
                <ShotCrop
                  src="metro-medspa-live.jpeg"
                  cw={bw - 3}
                  ch={bh - 58}
                  iw={1920}
                  ih={1080}
                  zoomFrom={1}
                  zoomTo={1.03}
                  zoomStart={0}
                  zoomEnd={CUT_TO_CAL}
                />
                {/* the real widget bubble sits bottom-right on the live site;
                    our rebuilt panel opens from the same spot */}
                <Widget open={open} />
                <Cursor
                  stops={[
                    {at: b(1), x: bw * 0.42, y: bh * 0.5},
                    {at: b(2.6), x: bw * 0.62, y: bh * 0.62},
                    {at: b(4.4), x: bw - 74, y: bh - 108},
                    {at: b(4.7), x: bw - 70, y: bh - 104, click: true},
                    {at: open + b(5.6), x: bw - 320, y: bh - 268},
                    {at: open + b(6.6), x: bw - 306, y: bh - 258, click: true},
                    {at: open + b(9), x: bw - 210, y: bh - 170},
                  ]}
                />
              </BrowserL>
            </div>
          </Stamp>
        </>
      ) : (
        <GCal from={CUT_TO_CAL} />
      )}

      {/* ticks only on the white calendar phase — illegible over the site photo */}
      <LogRowL
        items={[
          {at: CUT_TO_CAL + b(1), text: '✓ lead answered', ok: true},
          {at: CUT_TO_CAL + b(1.8), text: '✓ booked', ok: true},
          {at: CUT_TO_CAL + b(2.6), text: '✓ on the calendar', ok: true},
        ]}
      />
    </StageL>
  );
};
