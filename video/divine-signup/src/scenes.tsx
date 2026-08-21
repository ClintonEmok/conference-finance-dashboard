import type { CSSProperties, ReactNode } from "react"
import {
  BedDouble,
  CalendarDays,
  Check,
  CircleCheck,
  CreditCard,
  QrCode,
  Ticket,
  UserRound,
  UsersRound,
} from "lucide-react"
import {
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import {
  accommodationOptionsTotalMinor,
  divineRegistration,
  formatCatalogEuro,
  formatEuro,
  includedStayOptionsTotalMinor,
  selectedTicket,
  signupSteps,
  type SignupStep,
  type VideoFormat,
} from "./data"
import {
  ActionCursor,
  BrandHeader,
  colors,
  EventSummary,
  FormField,
  InnerCard,
  Panel,
  Pill,
  QuantityControl,
  RadioOption,
  RegistrationLayout,
  SceneReveal,
  SectionLabel,
  SummaryLine,
} from "./ui"

type SceneProps = {
  format: VideoFormat
  durationInFrames: number
}

function useAppear(delay: number, distance = 22): CSSProperties {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  })
  return {
    opacity: progress,
    transform: `translateY(${(1 - progress) * distance}px)`,
  }
}

function Animated({
  delay,
  children,
  style,
}: {
  delay: number
  children: ReactNode
  style?: CSSProperties
}) {
  const appear = useAppear(delay)
  return <div style={{ ...appear, ...style }}>{children}</div>
}

function AmbientBackground() {
  const frame = useCurrentFrame()
  const drift = Math.sin(frame / 42) * 18
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          borderRadius: 999,
          top: -430 + drift,
          right: -180,
          background:
            "radial-gradient(circle, rgba(80, 54, 220, 0.2), rgba(80, 54, 220, 0) 68%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: 999,
          bottom: -440 - drift,
          left: -160,
          background:
            "radial-gradient(circle, rgba(0, 217, 163, 0.09), rgba(0, 217, 163, 0) 68%)",
        }}
      />
    </div>
  )
}

type SummaryStage = "included" | "options" | "nightBefore"

function LiveSummary({
  stage,
  ticketSelected = true,
}: {
  stage: SummaryStage
  ticketSelected?: boolean
}) {
  const showOptions = stage === "options" || stage === "nightBefore"
  const showNightBefore = stage === "nightBefore"
  const totalMinor = showNightBefore
    ? divineRegistration.totalMinor
    : showOptions
      ? selectedTicket.priceMinor + includedStayOptionsTotalMinor
      : selectedTicket.priceMinor

  return (
    <EventSummary
      lines={
        <div>
          <SectionLabel>Selections</SectionLabel>
          {ticketSelected ? (
            <>
              <div
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  fontWeight: 700,
                  marginTop: 10,
                }}
              >
                {divineRegistration.attendeeCount}x {selectedTicket.label}
              </div>
              <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                {formatEuro(selectedTicket.priceMinor)} each
              </div>
              <div
                style={{
                  height: 1,
                  background: colors.borderSoft,
                  margin: "14px 0",
                }}
              />
              <SectionLabel>Accommodation</SectionLabel>
              <SummaryLine
                label="Included (Standard) · Single"
                value="Included"
                success
              />
              {showOptions ? (
                <>
                  <SummaryLine
                    label="Cot"
                    value={formatEuro(
                      divineRegistration.accommodation.cotMinor
                    )}
                  />
                  <SummaryLine
                    label="Superior upgrade"
                    value={formatEuro(
                      divineRegistration.accommodation.superiorUpgradeMinor
                    )}
                  />
                </>
              ) : null}
              {showNightBefore ? (
                <>
                  <SummaryLine
                    label={divineRegistration.accommodation.nightBeforeLabel}
                    value={formatEuro(
                      divineRegistration.accommodation.nightBeforeMinor
                    )}
                  />
                  <div
                    style={{
                      color: colors.success,
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 6,
                    }}
                  >
                    Breakfast included with the night-before stay
                  </div>
                </>
              ) : null}
              <div style={{ color: colors.muted, fontSize: 11, marginTop: 12 }}>
                2 nights · 23 Oct → 25 Oct · included with your ticket
              </div>
              <SummaryLine
                label="Total balance"
                value={formatEuro(totalMinor)}
                strong
              />
              <div style={{ color: colors.subtle, fontSize: 10, marginTop: 8 }}>
                Live quote — may change before submission.
              </div>
            </>
          ) : (
            <>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 13 }}>
                No tickets selected yet.
              </div>
              <div
                style={{ color: colors.subtle, fontSize: 11, marginTop: 18 }}
              >
                Loading live quote...
              </div>
            </>
          )}
        </div>
      }
    />
  )
}

export function WelcomeScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  })

  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <AmbientBackground />
      <div
        style={{
          height: "100%",
          padding: portrait ? "82px 60px 250px" : "62px 82px 180px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: portrait ? 24 : 18,
            transform: `scale(${0.9 + logoScale * 0.1})`,
            transformOrigin: "left center",
          }}
        >
          <Img
            src={staticFile("dlbc-logo.png")}
            style={{
              width: portrait ? 88 : 70,
              height: portrait ? 88 : 70,
              objectFit: "contain",
            }}
          />
          <div>
            <div
              style={{
                color: colors.foreground,
                fontSize: portrait ? 41 : 34,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              {divineRegistration.eventName}
            </div>
            <div
              style={{
                color: colors.primaryBright,
                fontSize: portrait ? 17 : 13,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginTop: 5,
              }}
            >
              Participant signup guide
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: portrait ? "1fr" : "1.15fr 0.85fr",
            alignItems: "center",
            gap: portrait ? 56 : 90,
            flex: 1,
          }}
        >
          <Animated delay={12}>
            <Pill tone="primary">DIVINE REDESIGN 2026</Pill>
            <h1
              style={{
                color: colors.foreground,
                fontSize: portrait ? 82 : 87,
                lineHeight: 0.98,
                letterSpacing: "-0.06em",
                fontWeight: 800,
                margin: portrait ? "30px 0 24px" : "26px 0 21px",
                maxWidth: portrait ? 900 : 900,
              }}
            >
              Your signup,
              <br />
              step by step.
            </h1>
            <p
              style={{
                color: colors.muted,
                fontSize: portrait ? 28 : 23,
                lineHeight: 1.45,
                margin: 0,
                maxWidth: 800,
              }}
            >
              A clear walkthrough of tickets, accommodation options, review,
              payment, and managing your booking.
            </p>
          </Animated>

          <Animated delay={25}>
            <Panel style={{ padding: portrait ? 34 : 30 }}>
              <SectionLabel>Five simple steps</SectionLabel>
              <div
                style={{
                  marginTop: 24,
                  display: "grid",
                  gap: portrait ? 20 : 15,
                }}
              >
                {signupSteps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 17,
                      color: colors.foreground,
                      fontSize: portrait ? 24 : 17,
                      fontWeight: 700,
                    }}
                  >
                    <div
                      style={{
                        width: portrait ? 46 : 36,
                        height: portrait ? 46 : 36,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color:
                          index === 0 ? colors.white : colors.primaryBright,
                        background:
                          index === 0 ? colors.primary : colors.primarySoft,
                        border: `1px solid ${colors.primary}`,
                        fontSize: portrait ? 19 : 14,
                      }}
                    >
                      {index + 1}
                    </div>
                    {step.label}
                  </div>
                ))}
              </div>
            </Panel>
          </Animated>
        </div>
      </div>
    </SceneReveal>
  )
}

export function TicketsScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const frame = useCurrentFrame()
  const selected = frame >= 102

  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <RegistrationLayout
        format={format}
        activeStep="tickets"
        title="Tickets"
        subtitle="Complete this section to proceed to the next step."
        summary={<LiveSummary stage="included" ticketSelected={selected} />}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: portrait ? 18 : 12,
          }}
        >
          {divineRegistration.tickets.map((ticketItem, index) => {
            const isSelected = ticketItem.selected && selected
            return (
              <Animated key={ticketItem.label} delay={8 + index * 4}>
                <InnerCard
                  selected={isSelected}
                  style={{ padding: portrait ? 23 : 17 }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 16 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: colors.foreground,
                          fontSize: portrait ? 25 : 17,
                          fontWeight: 750,
                        }}
                      >
                        {ticketItem.label}
                      </div>
                      <div
                        style={{
                          color: colors.muted,
                          fontSize: portrait ? 20 : 14,
                          marginTop: 7,
                        }}
                      >
                        {formatCatalogEuro(ticketItem.priceMinor)}
                      </div>
                    </div>
                    <QuantityControl value={isSelected ? 1 : 0} />
                  </div>
                </InnerCard>
              </Animated>
            )
          })}
        </div>
        <ActionCursor
          x={portrait ? 81 : 72}
          y={portrait ? 20 : 16}
          atFrame={92}
        />
      </RegistrationLayout>
    </SceneReveal>
  )
}

export function DetailsScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const frame = useCurrentFrame()
  const showAttendee = frame >= 179

  return (
    <SceneReveal durationInFrames={durationInFrames}>
      {showAttendee ? (
        <RegistrationLayout
          format={format}
          activeStep="attendees"
          title="Attendee details"
          subtitle="Complete this section to proceed to the next step."
          summary={<LiveSummary stage="included" />}
        >
          <Animated delay={8}>
            <InnerCard selected style={{ padding: portrait ? 28 : 22 }}>
              <div style={cardHeadingStyle}>
                <UsersRound
                  size={portrait ? 27 : 21}
                  color={colors.primaryBright}
                />
                Attendee 1
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <SectionLabel>Selected ticket</SectionLabel>
                <Pill>{selectedTicket.label}</Pill>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: portrait ? 20 : 14,
                  marginTop: portrait ? 26 : 19,
                }}
              >
                <FormField
                  label="Name *"
                  value={divineRegistration.attendee.name}
                />
                <FormField
                  label="Email"
                  value={divineRegistration.attendee.email}
                />
                <FormField
                  label="Phone"
                  value={divineRegistration.attendee.phoneDisplay}
                />
                <FormField
                  label="Gender *"
                  value={divineRegistration.attendee.gender}
                />
                <FormField
                  label="Location *"
                  value={divineRegistration.attendee.location}
                />
                <FormField
                  label="Dietary restrictions"
                  value={divineRegistration.attendee.dietaryRestrictions}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <FormField
                    label="Roommate preference"
                    value={divineRegistration.attendee.roommatePreference}
                  />
                </div>
              </div>
            </InnerCard>
          </Animated>
        </RegistrationLayout>
      ) : (
        <RegistrationLayout
          format={format}
          activeStep="contact"
          title="Your Details"
          subtitle="Complete this section to proceed to the next step."
          summary={<LiveSummary stage="included" />}
        >
          <Animated delay={10}>
            <InnerCard style={{ padding: portrait ? 28 : 22 }}>
              <div style={cardHeadingStyle}>
                <UserRound
                  size={portrait ? 27 : 21}
                  color={colors.primaryBright}
                />
                Your Details
              </div>
              <div
                style={{
                  display: "grid",
                  gap: portrait ? 22 : 14,
                  marginTop: portrait ? 26 : 19,
                }}
              >
                <FormField
                  label="Full Name *"
                  value={divineRegistration.attendee.name}
                />
                <FormField
                  label="Email Address *"
                  value={divineRegistration.attendee.email}
                />
                <FormField
                  label="Phone Number *"
                  value={divineRegistration.attendee.phoneDisplay}
                />
              </div>
            </InnerCard>
          </Animated>
        </RegistrationLayout>
      )}
    </SceneReveal>
  )
}

const cardHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  color: colors.foreground,
  fontSize: 18,
  fontWeight: 750,
}

export function IncludedStayScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <RegistrationLayout
        format={format}
        activeStep="accommodation"
        title="Accommodation options"
        subtitle="Complete this section to proceed to the next step."
        summary={<LiveSummary stage="included" />}
      >
        <Animated delay={9}>
          <InnerCard style={{ padding: portrait ? 30 : 24 }}>
            <div style={{ display: "flex", gap: 17, alignItems: "flex-start" }}>
              <div style={iconTileStyle}>
                <CalendarDays
                  size={portrait ? 29 : 23}
                  color={colors.primaryBright}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: colors.foreground,
                    fontSize: portrait ? 27 : 20,
                    fontWeight: 800,
                  }}
                >
                  Included accommodation (Standard)
                </div>
                <p
                  style={{
                    color: colors.muted,
                    fontSize: portrait ? 19 : 15,
                    lineHeight: 1.5,
                    margin: "10px 0 0",
                  }}
                >
                  Your ticket includes a Standard room. Superior is the
                  hotel&apos;s upgraded room category. Your ticket sets the
                  occupancy, and final room placement is confirmed by the
                  organizer.
                </p>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: portrait ? 20 : 13,
                marginTop: portrait ? 28 : 22,
              }}
            >
              <StayFact label="Check-in" value="Fri, 23 Oct 2026" />
              <StayFact label="Check-out" value="Sun, 25 Oct 2026" />
              <StayFact label="Nights" value="2" />
            </div>
          </InnerCard>
        </Animated>

        <Animated delay={21} style={{ marginTop: portrait ? 25 : 18 }}>
          <InnerCard selected style={{ padding: portrait ? 28 : 22 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: colors.muted, fontSize: 14 }}>
                Your selected ticket:
              </span>
              <Pill>{selectedTicket.label}</Pill>
              <Pill tone="success">Accommodation included with ticket</Pill>
            </div>
            <div
              style={{
                color: colors.muted,
                fontSize: portrait ? 17 : 13,
                marginTop: portrait ? 25 : 18,
              }}
            >
              You are choosing accommodation preferences only. Final room
              placement will be confirmed by the organizer.
            </div>
          </InnerCard>
        </Animated>
      </RegistrationLayout>
    </SceneReveal>
  )
}

function StayFact({
  label,
  value,
  success = false,
}: {
  label: string
  value: string
  success?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 11,
        background: colors.background,
        border: `1px solid ${colors.borderSoft}`,
      }}
    >
      <span style={{ color: colors.muted, fontSize: 14 }}>{label}</span>
      <span
        style={{
          color: success ? colors.success : colors.foreground,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  )
}

const iconTileStyle: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 13,
  background: colors.primarySoft,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
}

export function OptionsScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <RegistrationLayout
        format={format}
        activeStep="accommodation"
        title="Accommodation options"
        subtitle="Complete this section to proceed to the next step."
        summary={<LiveSummary stage="options" />}
      >
        <Animated delay={8}>
          <InnerCard style={{ padding: portrait ? 28 : 22 }}>
            <div style={{ ...cardHeadingStyle, marginBottom: 16 }}>
              Attendee 1 — {divineRegistration.attendee.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <span style={{ color: colors.muted, fontSize: 14 }}>
                Your selected ticket:
              </span>
              <Pill>{selectedTicket.label}</Pill>
              <Pill tone="success">Accommodation included with ticket</Pill>
            </div>

            <SectionLabel>Add-ons</SectionLabel>
            <InnerCard
              selected
              style={{ marginTop: 10, padding: portrait ? 24 : 18 }}
            >
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: colors.foreground,
                      fontSize: portrait ? 23 : 17,
                      fontWeight: 800,
                    }}
                  >
                    Cot
                  </div>
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: portrait ? 17 : 13,
                      lineHeight: 1.45,
                      marginTop: 5,
                    }}
                  >
                    Add a cot for a child staying in the room. Cots are charged
                    per cot, per night.
                  </div>
                  <div
                    style={{ color: colors.muted, fontSize: 13, marginTop: 5 }}
                  >
                    {formatEuro(
                      divineRegistration.accommodation.cotPerNightMinor
                    )}{" "}
                    / unit / night
                  </div>
                </div>
                <Pill>Remove</Pill>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 18,
                  marginTop: portrait ? 24 : 16,
                }}
              >
                <OptionCount
                  label="How many"
                  value={divineRegistration.accommodation.cotQuantity}
                />
                <OptionCount
                  label="Nights"
                  value={divineRegistration.accommodation.cotNights}
                />
              </div>
            </InnerCard>

            <SectionLabel>Included stay upgrade</SectionLabel>
            <InnerCard
              selected
              style={{ marginTop: 10, padding: portrait ? 24 : 18 }}
            >
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
              >
                <div style={iconTileStyle}>
                  <BedDouble size={24} color={colors.primaryBright} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: colors.foreground,
                      fontSize: portrait ? 23 : 17,
                      fontWeight: 800,
                    }}
                  >
                    Superior upgrade
                  </div>
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: portrait ? 17 : 13,
                      lineHeight: 1.45,
                      marginTop: 5,
                    }}
                  >
                    Upgrade the included Standard room to the hotel&apos;s
                    Superior room category.
                  </div>
                  <div
                    style={{ color: colors.muted, fontSize: 13, marginTop: 5 }}
                  >
                    {formatEuro(
                      divineRegistration.accommodation
                        .superiorUpgradePerPersonPerNightMinor
                    )}{" "}
                    / person / night for the included stay
                  </div>
                </div>
                <Pill>Remove</Pill>
              </div>
            </InnerCard>
          </InnerCard>
        </Animated>
        <ActionCursor
          x={portrait ? 85 : 88}
          y={portrait ? 45 : 44}
          atFrame={115}
        />
      </RegistrationLayout>
    </SceneReveal>
  )
}

function OptionCount({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <span style={{ color: colors.muted, fontSize: 14 }}>{label}</span>
      <QuantityControl value={value} />
    </div>
  )
}

export function NightBeforeScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const rates = divineRegistration.accommodation.nightBeforeRates
  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <RegistrationLayout
        format={format}
        activeStep="accommodation"
        title="Accommodation options"
        subtitle="Complete this section to proceed to the next step."
        summary={<LiveSummary stage="nightBefore" />}
      >
        <Animated delay={8}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 15,
              color: colors.foreground,
              fontSize: portrait ? 24 : 18,
              fontWeight: 800,
              marginBottom: portrait ? 22 : 16,
            }}
          >
            <CalendarDays color={colors.primaryBright} />
            Night before the event
          </div>
        </Animated>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: portrait ? "1fr" : "1fr 1fr",
            gap: portrait ? 18 : 14,
          }}
        >
          <Animated delay={12}>
            <RadioOption label="No night before" />
          </Animated>
          <Animated delay={16}>
            <RadioOption
              label={rates[0].label}
              priceMinor={rates[0].priceMinor}
            />
          </Animated>
          <Animated delay={20}>
            <RadioOption
              label={rates[1].label}
              priceMinor={rates[1].priceMinor}
            />
          </Animated>
          <Animated delay={24}>
            <RadioOption
              label={rates[2].label}
              priceMinor={rates[2].priceMinor}
            />
          </Animated>
          <Animated
            delay={28}
            style={!portrait ? { gridColumn: "1 / -1" } : undefined}
          >
            <RadioOption
              label={rates[3].label}
              priceMinor={rates[3].priceMinor}
              selected
            />
          </Animated>
        </div>
        <Animated delay={38} style={{ marginTop: portrait ? 28 : 20 }}>
          <InnerCard
            style={{
              padding: portrait ? 24 : 18,
              background: colors.successSoft,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <CircleCheck color={colors.success} size={portrait ? 28 : 22} />
              <div>
                <div
                  style={{
                    color: colors.success,
                    fontSize: portrait ? 21 : 16,
                    fontWeight: 800,
                  }}
                >
                  Breakfast included
                </div>
                <div
                  style={{
                    color: colors.muted,
                    fontSize: portrait ? 17 : 13,
                    marginTop: 4,
                  }}
                >
                  Breakfast included with this night-before stay
                </div>
              </div>
            </div>
          </InnerCard>
        </Animated>
        <ActionCursor
          x={portrait ? 87 : 88}
          y={portrait ? 60 : 56}
          atFrame={105}
        />
      </RegistrationLayout>
    </SceneReveal>
  )
}

export function ReviewScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const frame = useCurrentFrame()
  const verificationFocus = frame >= 175
  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <RegistrationLayout
        format={format}
        activeStep="review"
        title="Review & submit"
        subtitle="Complete this section to proceed to the next step."
        summary={<LiveSummary stage="nightBefore" />}
      >
        {verificationFocus ? (
          <VerificationFocus portrait={portrait} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: portrait ? "1fr" : "0.78fr 1.22fr",
              gap: portrait ? 20 : 18,
            }}
          >
            <Animated delay={8}>
              <InnerCard style={{ padding: portrait ? 24 : 19 }}>
                <div style={cardHeadingStyle}>Buyer Details</div>
                <div style={{ marginTop: 16 }}>
                  <DetailLine
                    label="Name"
                    value={divineRegistration.attendee.name}
                  />
                  <DetailLine
                    label="Email"
                    value={divineRegistration.attendee.email}
                  />
                  <DetailLine
                    label="Phone"
                    value={divineRegistration.attendee.phone}
                  />
                </div>
              </InnerCard>
              <InnerCard
                style={{
                  marginTop: portrait ? 20 : 16,
                  padding: portrait ? 24 : 19,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={cardHeadingStyle}>Attendee Details</div>
                    <div
                      style={{
                        color: colors.muted,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Attendee 1: {divineRegistration.attendee.name}
                    </div>
                  </div>
                  <Pill>1</Pill>
                </div>
                <div style={{ marginTop: 12 }}>
                  <DetailLine label="Ticket" value={selectedTicket.label} />
                  <DetailLine
                    label="Email"
                    value={divineRegistration.attendee.email}
                  />
                  <DetailLine
                    label="Phone"
                    value={divineRegistration.attendee.phone}
                  />
                  <DetailLine
                    label="Gender"
                    value={divineRegistration.attendee.gender}
                  />
                  <DetailLine
                    label="Location"
                    value={divineRegistration.attendee.location}
                  />
                  <DetailLine
                    label="Dietary"
                    value={divineRegistration.attendee.dietaryRestrictions}
                  />
                  <DetailLine
                    label="Roommate"
                    value={divineRegistration.attendee.roommatePreference}
                  />
                </div>
              </InnerCard>
            </Animated>

            <Animated delay={17}>
              <InnerCard style={{ padding: portrait ? 24 : 19 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={cardHeadingStyle}>Tickets</div>
                    <div
                      style={{
                        color: colors.muted,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Total: {formatEuro(selectedTicket.priceMinor)}
                    </div>
                  </div>
                  <Pill>1</Pill>
                </div>
                <div style={{ marginTop: 12 }}>
                  <SummaryLine
                    label={selectedTicket.label}
                    value={formatEuro(selectedTicket.priceMinor)}
                  />
                </div>
              </InnerCard>

              <InnerCard
                selected
                style={{ marginTop: 14, padding: portrait ? 24 : 19 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={cardHeadingStyle}>Accommodation</div>
                    <div
                      style={{
                        color: colors.muted,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Total: {formatEuro(accommodationOptionsTotalMinor)}
                    </div>
                  </div>
                  <Pill tone="primary">1</Pill>
                </div>
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: portrait ? 10 : 7,
                  }}
                >
                  <ReceiptLine
                    label={`${divineRegistration.attendee.name} — ${divineRegistration.accommodation.includedLabel}`}
                    detail="Included (Standard) · 2 nights · included with your ticket"
                    value="Included"
                    success
                  />
                  <ReceiptLine
                    label="Night before · Standard · Shared"
                    detail={`${formatEuro(divineRegistration.accommodation.nightBeforeBaseMinor)} / person / night · night before the event`}
                    value={formatEuro(
                      divineRegistration.accommodation.nightBeforeBaseMinor
                    )}
                  />
                  <ReceiptLine
                    label="Cot"
                    detail={`${formatEuro(divineRegistration.accommodation.cotPerNightMinor)} / cot / night · 1 cot · 2 nights`}
                    value={formatEuro(
                      divineRegistration.accommodation.cotMinor
                    )}
                  />
                  <ReceiptLine
                    label="Superior upgrade"
                    detail={`${formatEuro(divineRegistration.accommodation.superiorUpgradePerPersonPerNightMinor)} / person / night · 2 nights`}
                    value={formatEuro(
                      divineRegistration.accommodation.superiorUpgradeMinor
                    )}
                  />
                  <ReceiptLine
                    label="Night before · Superior"
                    detail={`${formatEuro(divineRegistration.accommodation.nightBeforeSuperiorUpgradeMinor)} / person / night`}
                    value={formatEuro(
                      divineRegistration.accommodation
                        .nightBeforeSuperiorUpgradeMinor
                    )}
                  />
                </div>
                <div
                  style={{ color: colors.success, fontSize: 12, marginTop: 10 }}
                >
                  Breakfast is included with the night-before stay.
                </div>
                <div style={{ marginTop: 12 }}>
                  <SummaryLine
                    label="Tickets"
                    value={formatEuro(selectedTicket.priceMinor)}
                  />
                  <SummaryLine
                    label="Accommodation"
                    value={formatEuro(accommodationOptionsTotalMinor)}
                  />
                  <SummaryLine
                    label="Total due"
                    value={formatEuro(divineRegistration.totalMinor)}
                    strong
                  />
                </div>
                <div
                  style={{ color: colors.muted, fontSize: 11, marginTop: 10 }}
                >
                  Prices are live and provisional. Final room placement will be
                  confirmed by the organizer.
                </div>
              </InnerCard>
            </Animated>
          </div>
        )}
        {verificationFocus ? (
          <ActionCursor
            x={portrait ? 78 : 82}
            y={portrait ? 72 : 68}
            atFrame={200}
          />
        ) : null}
      </RegistrationLayout>
    </SceneReveal>
  )
}

function VerificationFocus({ portrait }: { portrait: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: portrait ? "1fr" : "0.78fr 1.22fr",
        gap: portrait ? 20 : 18,
      }}
    >
      <Animated delay={0}>
        <InnerCard style={{ padding: portrait ? 24 : 19 }}>
          <div style={cardHeadingStyle}>Ready to submit</div>
          <div style={{ marginTop: 16 }}>
            <DetailLine
              label="Buyer"
              value={divineRegistration.attendee.name}
            />
            <DetailLine label="Attendee" value="1 complete" />
            <DetailLine label="Ticket" value={selectedTicket.label} />
            <DetailLine
              label="Stay"
              value={divineRegistration.accommodation.includedLabel}
            />
          </div>
        </InnerCard>
      </Animated>

      <Animated delay={0}>
        <InnerCard selected style={{ padding: portrait ? 28 : 22 }}>
          <SectionLabel>Live quote</SectionLabel>
          <div style={{ marginTop: 12 }}>
            <SummaryLine
              label="Tickets"
              value={formatEuro(selectedTicket.priceMinor)}
            />
            <SummaryLine
              label="Accommodation"
              value={formatEuro(accommodationOptionsTotalMinor)}
            />
            <SummaryLine
              label="Total due"
              value={formatEuro(divineRegistration.totalMinor)}
              strong
            />
          </div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>
            Prices are live and provisional. Final room placement will be
            confirmed by the organizer.
          </div>
        </InnerCard>

        <InnerCard style={{ marginTop: 18, padding: portrait ? 28 : 22 }}>
          <div style={cardHeadingStyle}>Verification</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              background: colors.background,
              padding: portrait ? 22 : 17,
              marginTop: 16,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                border: `2px solid ${colors.muted}`,
                borderRadius: 5,
              }}
            />
            <div>
              <div style={{ color: colors.foreground, fontWeight: 700 }}>
                Verify you are human
              </div>
              <div style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                Complete the verification challenge to continue.
              </div>
            </div>
          </div>
          <div
            style={{
              background: colors.primary,
              color: colors.white,
              borderRadius: 11,
              padding: "13px 18px",
              marginTop: 14,
              textAlign: "center",
              fontWeight: 800,
              opacity: 0.45,
            }}
          >
            Complete Registration
          </div>
        </InnerCard>
      </Animated>
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "78px 1fr",
        gap: 12,
        padding: "7px 0",
        fontSize: 14,
      }}
    >
      <span style={{ color: colors.muted }}>{label}</span>
      <span
        style={{
          color: colors.foreground,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ReceiptLine({
  label,
  detail,
  value,
  success = false,
}: {
  label: string
  detail: string
  value: string
  success?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 15,
        border: `1px solid ${success ? "#075a49" : colors.borderSoft}`,
        background: success ? colors.successSoft : colors.background,
        borderRadius: 12,
        padding: "13px 14px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{ color: colors.foreground, fontSize: 14, fontWeight: 700 }}
        >
          {label}
        </div>
        <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
          {detail}
        </div>
      </div>
      <div
        style={{
          color: success ? colors.success : colors.foreground,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 14,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  )
}

export function ConfirmationScene({ format, durationInFrames }: SceneProps) {
  const portrait = format === "portrait"
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const check = spring({
    frame: frame - 8,
    fps,
    config: { damping: 12, stiffness: 120 },
  })

  return (
    <SceneReveal durationInFrames={durationInFrames}>
      <AmbientBackground />
      <BrandHeader format={format} eyebrow="Illustrative post-submit preview" />
      <div
        style={{
          padding: portrait ? "48px 54px 230px" : "34px 72px 185px",
          display: "grid",
          gridTemplateColumns: portrait ? "1fr" : "1.15fr 0.85fr",
          gap: portrait ? 34 : 30,
          height: portrait ? "calc(100% - 150px)" : "calc(100% - 112px)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: portrait ? 30 : 20,
          }}
        >
          <Animated delay={8}>
            <div
              style={{
                width: portrait ? 82 : 65,
                height: portrait ? 82 : 65,
                borderRadius: 999,
                border: `2px solid ${colors.success}`,
                color: colors.success,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${check})`,
              }}
            >
              <Check size={portrait ? 44 : 35} strokeWidth={3} />
            </div>
            <h1
              style={{
                color: colors.foreground,
                fontSize: portrait ? 68 : 64,
                lineHeight: 1,
                letterSpacing: "-0.055em",
                fontWeight: 800,
                margin: portrait ? "25px 0 15px" : "19px 0 13px",
              }}
            >
              After submission
            </h1>
            <p
              style={{
                color: colors.muted,
                fontSize: portrait ? 22 : 18,
                lineHeight: 1.45,
                margin: 0,
                maxWidth: 800,
              }}
            >
              This illustrative preview shows the confirmation page for{" "}
              <strong style={{ color: colors.foreground }}>
                {divineRegistration.eventName}
              </strong>{" "}
              after a successful submission. No booking was created while
              producing this guide. Confirmation is sent to{" "}
              <strong style={{ color: colors.foreground }}>
                {divineRegistration.attendee.email}
              </strong>
              .
            </p>
          </Animated>

          <Animated delay={22}>
            <Panel style={{ padding: portrait ? 27 : 21 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={iconTileStyle}>
                  <CreditCard size={24} color={colors.primaryBright} />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel>Payment required</SectionLabel>
                  <div
                    style={{
                      color: colors.foreground,
                      fontSize: portrait ? 25 : 20,
                      fontWeight: 800,
                      marginTop: 7,
                    }}
                  >
                    Complete Your Payment
                  </div>
                  <div
                    style={{ color: colors.muted, fontSize: 13, marginTop: 5 }}
                  >
                    Scan to pay {formatEuro(divineRegistration.totalMinor)} or
                    open Tikkie.
                  </div>
                </div>
                <QrCode size={portrait ? 64 : 52} color={colors.foreground} />
              </div>
            </Panel>
          </Animated>

          <Animated delay={30}>
            <Panel style={{ padding: portrait ? 25 : 19 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <UsersRound
                  size={portrait ? 28 : 22}
                  color={colors.primaryBright}
                />
                <div>
                  <div
                    style={{
                      color: colors.foreground,
                      fontSize: portrait ? 21 : 16,
                      fontWeight: 750,
                    }}
                  >
                    Example attendees
                  </div>
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: portrait ? 17 : 13,
                      marginTop: 4,
                    }}
                  >
                    1 attendee shown · {divineRegistration.attendee.name} ·{" "}
                    {selectedTicket.label}
                  </div>
                </div>
              </div>
            </Panel>
          </Animated>
        </div>

        <Animated delay={17}>
          <Panel
            style={{
              padding: portrait ? 32 : 28,
              background: "linear-gradient(145deg, #211a35, #17121a 72%)",
              alignSelf: "start",
            }}
          >
            <SectionLabel>Example booking reference</SectionLabel>
            <div
              style={{
                color: colors.foreground,
                fontSize: portrait ? 49 : 42,
                lineHeight: 1.1,
                fontWeight: 800,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                letterSpacing: "-0.03em",
                marginTop: 17,
                overflowWrap: "anywhere",
              }}
            >
              {divineRegistration.bookingRef}
            </div>
            <div
              style={{ height: 1, background: colors.border, margin: "28px 0" }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <Metric
                icon={<Ticket size={20} />}
                label="Tickets"
                value={String(divineRegistration.attendeeCount)}
              />
              <Metric
                icon={<UserRound size={20} />}
                label="Attendees"
                value={String(divineRegistration.attendeeCount)}
              />
              <Metric icon={<BedDouble size={20} />} label="Rooms" value="1" />
              <Metric
                icon={<CreditCard size={20} />}
                label="Total"
                value={formatEuro(divineRegistration.totalMinor)}
              />
            </div>
            <div
              style={{
                marginTop: 24,
                background: colors.primary,
                color: colors.white,
                borderRadius: 12,
                padding: "15px 18px",
                textAlign: "center",
                fontSize: portrait ? 20 : 15,
                fontWeight: 800,
              }}
            >
              Manage booking preview
            </div>
          </Panel>
        </Animated>
      </div>
    </SceneReveal>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${colors.borderSoft}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          color: colors.primaryBright,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {icon}
        <SectionLabel>{label}</SectionLabel>
      </div>
      <div
        style={{
          color: colors.foreground,
          fontSize: 20,
          fontWeight: 800,
          marginTop: 11,
        }}
      >
        {value}
      </div>
    </div>
  )
}

export const sceneComponents = {
  welcome: WelcomeScene,
  tickets: TicketsScene,
  details: DetailsScene,
  included: IncludedStayScene,
  options: OptionsScene,
  nightBefore: NightBeforeScene,
  review: ReviewScene,
  confirmation: ConfirmationScene,
} satisfies Record<
  | "welcome"
  | "tickets"
  | "details"
  | "included"
  | "options"
  | "nightBefore"
  | "review"
  | "confirmation",
  (props: SceneProps) => ReactNode
>

export const stepForScene: Record<
  keyof typeof sceneComponents,
  SignupStep | null
> = {
  welcome: null,
  tickets: "tickets",
  details: "attendees",
  included: "accommodation",
  options: "accommodation",
  nightBefore: "accommodation",
  review: "review",
  confirmation: null,
}
