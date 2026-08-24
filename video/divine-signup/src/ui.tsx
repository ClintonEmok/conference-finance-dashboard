import type { CSSProperties, ReactNode } from "react"
import { loadFont } from "@remotion/google-fonts/Outfit"
import { Check, CalendarDays, Minus, MousePointer2, Plus } from "lucide-react"
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import {
  AUDIO_DELAY_FRAMES,
  divineRegistration,
  formatEuro,
  signupSteps,
  VIDEO_FPS,
  type CaptionChunk,
  type SignupStep,
  type VideoFormat,
} from "./data"

const outfit = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
})

export const fontFamily = outfit.fontFamily

export const colors = {
  background: "#0c090e",
  surface: "#1a141c",
  surfaceRaised: "#211923",
  border: "#352b38",
  borderSoft: "#2b232e",
  foreground: "#faf8fb",
  muted: "#aca2ae",
  subtle: "#716777",
  primary: "#5036dc",
  primaryBright: "#6b52f2",
  primarySoft: "#251b4d",
  success: "#00d9a3",
  successSoft: "#0d2825",
  white: "#ffffff",
}

export function BrandHeader({
  format,
  eyebrow,
}: {
  format: VideoFormat
  eyebrow: string
}) {
  const portrait = format === "portrait"
  return (
    <div
      style={{
        height: portrait ? 150 : 112,
        display: "flex",
        alignItems: "center",
        gap: portrait ? 24 : 18,
        padding: portrait ? "22px 52px" : "18px 64px",
        borderBottom: portrait ? `1px solid ${colors.borderSoft}` : undefined,
      }}
    >
      <Img
        src={staticFile("dlbc-logo.png")}
        style={{
          width: portrait ? 76 : 60,
          height: portrait ? 76 : 60,
          objectFit: "contain",
        }}
      />
      <div>
        <div
          style={{
            color: colors.foreground,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            fontSize: portrait ? 39 : 29,
            lineHeight: 1,
          }}
        >
          {divineRegistration.eventName}
        </div>
        <div
          style={{
            color: colors.muted,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontSize: portrait ? 17 : 13,
            marginTop: 9,
          }}
        >
          {eyebrow}
        </div>
      </div>
    </div>
  )
}

export function ProgressRail({
  activeStep,
  format,
}: {
  activeStep: SignupStep
  format: VideoFormat
}) {
  const activeIndex = signupSteps.findIndex((step) => step.id === activeStep)
  const portrait = format === "portrait"

  if (portrait) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "26px 52px 18px",
        }}
      >
        {signupSteps.map((step, index) => {
          const complete = index < activeIndex
          const active = index === activeIndex
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                flex: index < signupSteps.length - 1 ? 1 : undefined,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px solid ${active || complete ? colors.primaryBright : colors.border}`,
                  background: complete ? colors.primary : colors.background,
                  color: complete || active ? colors.white : colors.subtle,
                  fontSize: 17,
                  fontWeight: 700,
                  boxShadow: active
                    ? `0 0 0 7px ${colors.primarySoft}`
                    : undefined,
                }}
              >
                {complete ? <Check size={23} strokeWidth={3} /> : index + 1}
              </div>
              {index < signupSteps.length - 1 ? (
                <div
                  style={{
                    height: 2,
                    flex: 1,
                    margin: "0 12px",
                    background:
                      index < activeIndex ? colors.primary : colors.borderSoft,
                  }}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Panel style={{ padding: "20px 22px 18px" }}>
      <SectionLabel>Event registration</SectionLabel>
      <div
        style={{
          width: 56,
          height: 6,
          borderRadius: 99,
          background: colors.primarySoft,
          marginTop: 12,
          marginBottom: 20,
        }}
      />
      {signupSteps.map((step, index) => {
        const complete = index < activeIndex
        const active = index === activeIndex
        return (
          <div
            key={step.id}
            style={{
              display: "grid",
              gridTemplateColumns: "38px 1fr",
              minHeight: 56,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px solid ${active || complete ? colors.primaryBright : colors.border}`,
                  background: complete ? colors.primary : colors.surface,
                  color: complete || active ? colors.white : colors.subtle,
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: active
                    ? `0 0 0 5px ${colors.background}, 0 0 0 7px ${colors.primary}`
                    : undefined,
                }}
              >
                {complete ? <Check size={18} strokeWidth={3} /> : index + 1}
              </div>
              {index < signupSteps.length - 1 ? (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    margin: "6px 0",
                    background:
                      index < activeIndex ? colors.primary : colors.borderSoft,
                  }}
                />
              ) : null}
            </div>
            <div style={{ paddingLeft: 8, paddingTop: 2 }}>
              <div
                style={{
                  color: active ? colors.primaryBright : colors.subtle,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                Step {index + 1}
              </div>
              <div
                style={{
                  color: active || complete ? colors.foreground : colors.subtle,
                  fontSize: 14,
                  fontWeight: 700,
                  marginTop: 3,
                }}
              >
                {step.label}
              </div>
            </div>
          </div>
        )
      })}
    </Panel>
  )
}

export function RegistrationLayout({
  format,
  activeStep,
  title,
  subtitle,
  children,
  summary,
}: {
  format: VideoFormat
  activeStep: SignupStep
  title: string
  subtitle: string
  children: ReactNode
  summary?: ReactNode
}) {
  const portrait = format === "portrait"

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <BrandHeader
        format={format}
        eyebrow={`Step ${signupSteps.findIndex((step) => step.id === activeStep) + 1}: ${title}`}
      />
      {portrait ? (
        <ProgressRail activeStep={activeStep} format={format} />
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: portrait ? "1fr" : "360px minmax(0, 1fr)",
          gap: portrait ? 0 : 40,
          padding: portrait ? "8px 44px 210px" : "28px 64px 185px",
          minHeight: 0,
          flex: 1,
        }}
      >
        {!portrait ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <ProgressRail activeStep={activeStep} format={format} />
            {summary ? <Panel style={{ padding: 20 }}>{summary}</Panel> : null}
          </div>
        ) : null}
        <Panel
          style={{
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: portrait ? "30px 32px 24px" : "23px 28px 20px",
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <h2
              style={{
                color: colors.foreground,
                fontWeight: 800,
                fontSize: portrait ? 36 : 27,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              {title}
            </h2>
            <p
              style={{
                color: colors.muted,
                fontSize: portrait ? 20 : 16,
                lineHeight: 1.4,
                margin: "8px 0 0",
              }}
            >
              {subtitle}
            </p>
          </div>
          <div
            style={{
              padding: portrait ? 30 : 22,
              minHeight: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {children}
          </div>
        </Panel>
      </div>
    </div>
  )
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 19,
        boxShadow: "0 24px 80px rgba(0, 0, 0, 0.22)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function InnerCard({
  children,
  selected = false,
  style,
}: {
  children: ReactNode
  selected?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: selected ? "#1d162b" : "#19131b",
        border: `1px solid ${selected ? colors.primaryBright : colors.border}`,
        borderRadius: 16,
        padding: 19,
        boxShadow: selected ? "0 0 0 1px rgba(107, 82, 242, 0.18)" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: colors.muted,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  )
}

export function EventSummary({ lines }: { lines: ReactNode }) {
  return (
    <>
      <SectionLabel>Registration summary</SectionLabel>
      <div
        style={{
          color: colors.foreground,
          fontSize: 20,
          fontWeight: 700,
          marginTop: 18,
        }}
      >
        {divineRegistration.eventName}
      </div>
      <div
        style={{
          display: "flex",
          gap: 9,
          color: colors.muted,
          alignItems: "center",
          fontSize: 13,
          marginTop: 10,
        }}
      >
        <CalendarDays size={15} color={colors.primaryBright} />
        {divineRegistration.eventDateShort}
      </div>
      <div
        style={{
          height: 1,
          background: colors.borderSoft,
          margin: "18px 0",
        }}
      />
      {lines}
    </>
  )
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "primary"
}) {
  const palette =
    tone === "success"
      ? {
          color: colors.success,
          background: "#082c26",
          border: "#006c59",
        }
      : tone === "primary"
        ? {
            color: "#c2b9ff",
            background: colors.primarySoft,
            border: colors.primary,
          }
        : {
            color: colors.foreground,
            background: "#302a32",
            border: "#3a333d",
          }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        padding: "5px 10px",
        fontSize: 12,
        lineHeight: 1,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  )
}

export function RadioOption({
  label,
  priceMinor,
  selected = false,
  compact = false,
}: {
  label: string
  priceMinor?: number
  selected?: boolean
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 8 : 11,
        border: `1px solid ${selected ? colors.primaryBright : colors.border}`,
        background: selected ? colors.primarySoft : "transparent",
        color: colors.foreground,
        borderRadius: 12,
        padding: compact ? "10px 12px" : "13px 15px",
        fontSize: compact ? 13 : 15,
        fontWeight: selected ? 700 : 500,
      }}
    >
      <div
        style={{
          width: compact ? 16 : 19,
          height: compact ? 16 : 19,
          borderRadius: 999,
          border: `2px solid ${selected ? colors.primaryBright : "#706976"}`,
          padding: 3,
        }}
      >
        {selected ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              background: colors.white,
            }}
          />
        ) : null}
      </div>
      <span>{label}</span>
      {priceMinor !== undefined ? (
        <span
          style={{
            color: colors.muted,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {formatEuro(priceMinor)}
        </span>
      ) : null}
    </div>
  )
}

export function QuantityControl({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={quantityButtonStyle}>
        <Minus size={14} />
      </div>
      <div
        style={{
          minWidth: 22,
          color: colors.foreground,
          textAlign: "center",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {value}
      </div>
      <div style={quantityButtonStyle}>
        <Plus size={14} />
      </div>
    </div>
  )
}

const quantityButtonStyle: CSSProperties = {
  width: 31,
  height: 31,
  borderRadius: 9,
  border: `1px solid ${colors.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: colors.foreground,
  background: colors.surfaceRaised,
}

export function FormField({
  label,
  value,
  width,
}: {
  label: string
  value: string
  width?: string | number
}) {
  return (
    <div style={{ width, minWidth: 0 }}>
      <div
        style={{
          color: colors.foreground,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: 47,
          display: "flex",
          alignItems: "center",
          color: colors.foreground,
          fontSize: 15,
          border: `1px solid ${colors.border}`,
          borderRadius: 11,
          background: "#120f14",
          padding: "0 14px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  )
}

export function SummaryLine({
  label,
  value,
  strong = false,
  success = false,
}: {
  label: string
  value: string
  strong?: boolean
  success?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        color: strong ? colors.foreground : colors.muted,
        fontSize: strong ? 17 : 14,
        fontWeight: strong ? 800 : 500,
        padding: strong ? "15px 0 0" : "6px 0",
        borderTop: strong ? `1px solid ${colors.border}` : undefined,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          color: success
            ? colors.success
            : strong
              ? colors.foreground
              : colors.muted,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function SceneReveal({
  children,
  durationInFrames,
}: {
  children: ReactNode
  durationInFrames: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 110 } })
  const exit = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        opacity: enter * exit,
        transform: `translateY(${(1 - enter) * 24}px) scale(${0.985 + enter * 0.015})`,
      }}
    >
      {children}
    </div>
  )
}

export function ActionCursor({
  x,
  y,
  atFrame,
}: {
  x: number
  y: number
  atFrame: number
}) {
  const frame = useCurrentFrame()
  const progress = interpolate(
    frame,
    [atFrame - 18, atFrame, atFrame + 12, atFrame + 35],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )
  const pulse = interpolate(frame, [atFrame, atFrame + 15], [0.6, 1.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        opacity: progress,
        transform: `translate(-8px, -6px) scale(${0.85 + progress * 0.15})`,
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 42,
          height: 42,
          borderRadius: 999,
          border: `2px solid ${colors.primaryBright}`,
          transform: `translate(-13px, -13px) scale(${pulse})`,
          opacity: Math.max(0, 1.2 - pulse),
        }}
      />
      <MousePointer2 size={34} fill={colors.white} color={colors.background} />
    </div>
  )
}

export function CaptionOverlay({
  captions,
  format,
  size = "standard",
}: {
  captions: CaptionChunk[]
  format: VideoFormat
  size?: "standard" | "large"
}) {
  const frame = useCurrentFrame()
  const portrait = format === "portrait"
  const large = size === "large"
  const localSeconds = (frame - AUDIO_DELAY_FRAMES) / VIDEO_FPS
  const active = captions.find(
    (caption) =>
      localSeconds >= caption.startSeconds && localSeconds < caption.endSeconds
  )

  if (!active) return null

  const opacity = interpolate(
    frame,
    [
      AUDIO_DELAY_FRAMES + active.startSeconds * VIDEO_FPS,
      AUDIO_DELAY_FRAMES + active.startSeconds * VIDEO_FPS + 5,
      AUDIO_DELAY_FRAMES + active.endSeconds * VIDEO_FPS - 5,
      AUDIO_DELAY_FRAMES + active.endSeconds * VIDEO_FPS,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 50,
        left: portrait ? (large ? 38 : 54) : large ? "60%" : "50%",
        right: portrait ? (large ? 38 : 54) : undefined,
        bottom: portrait ? (large ? 48 : 58) : large ? 42 : 38,
        transform: portrait ? undefined : "translateX(-50%)",
        width: portrait ? undefined : large ? 1400 : 1180,
        display: "flex",
        justifyContent: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          color: colors.white,
          background: "rgba(10, 8, 12, 0.9)",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.38)",
          borderRadius: portrait ? (large ? 28 : 24) : large ? 18 : 15,
          padding: portrait
            ? large
              ? "26px 32px"
              : "22px 28px"
            : large
              ? "17px 28px"
              : "14px 24px",
          fontSize: portrait ? (large ? 40 : 30) : large ? 50 : 23,
          fontWeight: 650,
          lineHeight: large ? 1.24 : 1.3,
          textAlign: "center",
          maxWidth: "100%",
        }}
      >
        {active.text}
      </div>
    </div>
  )
}
