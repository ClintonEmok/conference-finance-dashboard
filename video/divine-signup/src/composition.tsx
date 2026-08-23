import { Audio } from "@remotion/media"
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import {
  AUDIO_DELAY_FRAMES,
  divineRegistration,
  INTRO_DURATION_IN_FRAMES,
  OUTRO_DURATION_IN_FRAMES,
  storyScenes,
  type VideoFormat,
} from "./data"
import { sceneComponents } from "./scenes"
import { CaptionOverlay, colors, fontFamily } from "./ui"

function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        padding: size * 0.045,
        background: colors.white,
        borderRadius: size * 0.12,
        boxShadow: "0 28px 90px rgba(0, 0, 0, 0.35)",
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("dlbc-logo.png")}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  )
}

function BrandBackdrop() {
  const frame = useCurrentFrame()
  const drift = Math.sin(frame / 32) * 20

  return (
    <>
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: 999,
          top: -620 + drift,
          right: -240,
          background:
            "radial-gradient(circle, rgba(80, 54, 220, 0.32), rgba(80, 54, 220, 0) 68%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: 999,
          bottom: -540 - drift,
          left: -220,
          background:
            "radial-gradient(circle, rgba(0, 217, 163, 0.12), rgba(0, 217, 163, 0) 68%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 42%, rgba(107, 82, 242, 0.06))",
        }}
      />
    </>
  )
}

function BrandIntro({ format }: { format: VideoFormat }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const portrait = format === "portrait"
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.8 },
    durationInFrames: 38,
  })
  const contentProgress = interpolate(frame, [18, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const lineProgress = interpolate(frame, [22, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = interpolate(
    frame,
    [0, 8, INTRO_DURATION_IN_FRAMES - 18, INTRO_DURATION_IN_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )

  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.foreground,
        fontFamily,
        opacity,
      }}
    >
      <BrandBackdrop />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: portrait ? "column" : "row",
          gap: portrait ? 42 : 58,
          padding: portrait ? "120px 70px" : "72px 100px",
          textAlign: portrait ? "center" : "left",
        }}
      >
        <div
          style={{
            opacity: logoProgress,
            transform: `translateY(${(1 - logoProgress) * 24}px) scale(${0.82 + logoProgress * 0.18})`,
          }}
        >
          <BrandMark size={portrait ? 318 : 252} />
        </div>
        <div
          style={{
            opacity: contentProgress,
            transform: `translateY(${(1 - contentProgress) * 18}px)`,
            maxWidth: portrait ? 760 : 780,
          }}
        >
          <div
            style={{
              color: colors.primaryBright,
              fontSize: portrait ? 20 : 16,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Divine Redesign 2026
          </div>
          <div
            style={{
              width: portrait ? 240 : 330,
              height: 3,
              margin: portrait ? "24px auto 26px" : "22px 0 24px",
              background: colors.primaryBright,
              transform: `scaleX(${lineProgress})`,
              transformOrigin: portrait ? "center" : "left",
            }}
          />
          <div
            style={{
              fontSize: portrait ? 76 : 64,
              lineHeight: 0.98,
              letterSpacing: "-0.06em",
              fontWeight: 800,
            }}
          >
            Signup walkthrough
          </div>
          <div
            style={{
              marginTop: 22,
              color: colors.muted,
              fontSize: portrait ? 28 : 22,
              lineHeight: 1.4,
            }}
          >
            Tickets, accommodation, review, and payment.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

function BrandOutro({ format }: { format: VideoFormat }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const portrait = format === "portrait"
  const enter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100, mass: 0.9 },
    durationInFrames: 38,
  })
  const exit = interpolate(
    frame,
    [OUTRO_DURATION_IN_FRAMES - 24, OUTRO_DURATION_IN_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )
  const opacity = enter * exit

  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.foreground,
        fontFamily,
      }}
    >
      <BrandBackdrop />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: portrait ? "column" : "row",
          gap: portrait ? 34 : 48,
          padding: portrait ? "120px 70px" : "72px 100px",
          textAlign: portrait ? "center" : "left",
          opacity,
          transform: `translateY(${(1 - enter) * 20}px)`,
        }}
      >
        <BrandMark size={portrait ? 250 : 190} />
        <div>
          <div
            style={{
              color: colors.primaryBright,
              fontSize: portrait ? 20 : 16,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            {divineRegistration.eventName} 2026
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: portrait ? 68 : 56,
              lineHeight: 1,
              letterSpacing: "-0.055em",
              fontWeight: 800,
            }}
          >
            Walkthrough complete.
          </div>
          <div
            style={{
              marginTop: 20,
              color: colors.muted,
              fontSize: portrait ? 27 : 21,
            }}
          >
            Thanks for following along.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

export function DivineSignupVideo({
  format,
  captionSize = "standard",
}: {
  format: VideoFormat
  captionSize?: "standard" | "large"
}) {
  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        color: colors.foreground,
        fontFamily,
      }}
    >
      <Sequence
        durationInFrames={INTRO_DURATION_IN_FRAMES}
        premountFor={10}
      >
        <BrandIntro format={format} />
      </Sequence>
      {storyScenes.map((scene, index) => {
        const Scene = sceneComponents[scene.id]
        const from = storyScenes
          .slice(0, index)
          .reduce(
            (total, previousScene) => total + previousScene.durationInFrames,
            INTRO_DURATION_IN_FRAMES
          )

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={scene.durationInFrames}
            premountFor={10}
          >
            <Scene format={format} durationInFrames={scene.durationInFrames} />
            <Sequence from={AUDIO_DELAY_FRAMES} layout="none">
              <Audio
                src={staticFile(`video/divine-signup/${scene.audioFile}`)}
              />
            </Sequence>
            <CaptionOverlay
              captions={scene.captions}
              format={format}
              size={captionSize}
            />
          </Sequence>
        )
      })}
      <Sequence
        from={INTRO_DURATION_IN_FRAMES + storyScenes.reduce(
          (total, scene) => total + scene.durationInFrames,
          0
        )}
        durationInFrames={OUTRO_DURATION_IN_FRAMES}
        premountFor={10}
      >
        <BrandOutro format={format} />
      </Sequence>
    </AbsoluteFill>
  )
}

export function DivineSignupLandscape() {
  return <DivineSignupVideo format="landscape" />
}

export function DivineSignupPortrait() {
  return <DivineSignupVideo format="portrait" />
}

export function DivineSignupLandscapeLargeSubtitles() {
  return <DivineSignupVideo format="landscape" captionSize="large" />
}

export function DivineSignupPortraitLargeSubtitles() {
  return <DivineSignupVideo format="portrait" captionSize="large" />
}
