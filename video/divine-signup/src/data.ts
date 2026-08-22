export const VIDEO_FPS = 30
export const AUDIO_DELAY_FRAMES = 20
export const REVIEW_VERIFICATION_FRAME = 175
export const INTRO_DURATION_IN_FRAMES = 75
export const OUTRO_DURATION_IN_FRAMES = 90

export type VideoFormat = "landscape" | "portrait"

const nightBeforeRates = [
  { label: "Standard · Single", priceMinor: 9_000 },
  { label: "Standard · Shared", priceMinor: 6_000 },
  { label: "Superior · Single", priceMinor: 10_000 },
  { label: "Superior · Shared", priceMinor: 7_000 },
] as const
const selectedNightBefore = nightBeforeRates[3]

export const divineRegistration = {
  eventName: "Divine Redesign",
  eventDate: "Friday, 23 October 2026",
  eventDateShort: "23 OCT 2026",
  attendee: {
    name: "Jordan Example",
    email: "jordan@example.com",
    phone: "+31600000000",
    phoneDisplay: "+31 6 00000000",
    gender: "Male",
    location: "Eindhoven",
    dietaryRestrictions: "None",
    roommatePreference: "No preference",
  },
  attendeeCount: 1,
  bookingRef: "EXAMPLE-DR-0001",
  tickets: [
    { label: "Single Room", priceMinor: 35_000, selected: true },
    { label: "18+", priceMinor: 25_000, selected: false },
    { label: "12-17", priceMinor: 15_000, selected: false },
    { label: "3-11", priceMinor: 12_500, selected: false },
    { label: "under 3", priceMinor: 0, selected: false },
  ],
  accommodation: {
    includedLabel: "Standard · Single",
    nights: 2,
    breakfastIncludedWithIncludedStay: false,
    breakfastIncludedWithNightBefore: true,
    superiorUpgradePerPersonPerNightMinor: 1_000,
    superiorUpgradeMinor: 2_000,
    cotPerNightMinor: 1_000,
    cotQuantity: 1,
    cotNights: 2,
    cotMinor: 2_000,
    nightBeforeRates,
    nightBeforeBaseMinor: 6_000,
    nightBeforeSuperiorUpgradeMinor: 1_000,
    nightBeforeMinor: selectedNightBefore.priceMinor,
    nightBeforeLabel: selectedNightBefore.label,
  },
  totalMinor: 46_000,
} as const

export const selectedTicket = divineRegistration.tickets[0]
export const includedStayOptionsTotalMinor =
  divineRegistration.accommodation.superiorUpgradeMinor +
  divineRegistration.accommodation.cotMinor
export const accommodationOptionsTotalMinor =
  includedStayOptionsTotalMinor +
  divineRegistration.accommodation.nightBeforeMinor
export const calculatedRegistrationTotalMinor =
  selectedTicket.priceMinor + accommodationOptionsTotalMinor

export const formatEuro = (minor: number) =>
  `\u20ac${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)}`

export const formatCatalogEuro = (minor: number) =>
  `\u20ac${(minor / 100).toFixed(2)}`

export type SignupStep =
  | "tickets"
  | "contact"
  | "attendees"
  | "accommodation"
  | "review"

export const signupSteps: Array<{ id: SignupStep; label: string }> = [
  { id: "tickets", label: "Ticket Selection" },
  { id: "contact", label: "Contact Details" },
  { id: "attendees", label: "Attendee Info" },
  { id: "accommodation", label: "Accommodation options" },
  { id: "review", label: "Review & Submit" },
]

export type CaptionChunk = {
  text: string
  startSeconds: number
  endSeconds: number
}

export type StoryScene = {
  id:
    | "welcome"
    | "tickets"
    | "details"
    | "included"
    | "options"
    | "nightBefore"
    | "review"
    | "confirmation"
  durationInFrames: number
  audioFile: string
  audioDurationSeconds: number
  captions: CaptionChunk[]
}

export const storyScenes: StoryScene[] = [
  {
    id: "welcome",
    durationInFrames: 300,
    audioFile: "01-welcome.mp3",
    audioDurationSeconds: 8.8,
    captions: [
      {
        text: "In this example, we'll walk through signing up for Divine Redesign 2026,",
        startSeconds: 0,
        endSeconds: 5.35,
      },
      {
        text: "using one Single Room ticket for one attendee.",
        startSeconds: 5.35,
        endSeconds: 8.7,
      },
    ],
  },
  {
    id: "tickets",
    durationInFrames: 181,
    audioFile: "02-tickets.mp3",
    audioDurationSeconds: 4.375,
    captions: [
      {
        text: "Select one Single Room ticket,",
        startSeconds: 0,
        endSeconds: 2.25,
      },
      {
        text: "then continue to the next step.",
        startSeconds: 2.25,
        endSeconds: 4.28,
      },
    ],
  },
  {
    id: "details",
    durationInFrames: 398,
    audioFile: "03-details.mp3",
    audioDurationSeconds: 11.625,
    captions: [
      {
        text: "Next, enter the buyer's full name, email address, and phone number.",
        startSeconds: 0,
        endSeconds: 5.5,
      },
      {
        text: "Then complete each attendee's name, gender, location, and any optional contact or room details.",
        startSeconds: 5.5,
        endSeconds: 11.52,
      },
    ],
  },
  {
    id: "included",
    durationInFrames: 361,
    audioFile: "04-included-stay.mp3",
    audioDurationSeconds: 10.4,
    captions: [
      {
        text: "The Single Room ticket includes a Standard single room for two nights.",
        startSeconds: 0,
        endSeconds: 5.3,
      },
      {
        text: "Your ticket sets the occupancy, and the organizer confirms the final room placement.",
        startSeconds: 5.3,
        endSeconds: 10.3,
      },
    ],
  },
  {
    id: "options",
    durationInFrames: 388,
    audioFile: "05-options.mp3",
    audioDurationSeconds: 11.3,
    captions: [
      {
        text: "On the accommodation step, you can add a cot by choosing the quantity and number of nights.",
        startSeconds: 0,
        endSeconds: 5.75,
      },
      {
        text: "You may also upgrade the included stay to Superior for ten euros per person, per night.",
        startSeconds: 5.75,
        endSeconds: 11.2,
      },
    ],
  },
  {
    id: "nightBefore",
    durationInFrames: 352,
    audioFile: "06-night-before.mp3",
    audioDurationSeconds: 10.45,
    captions: [
      {
        text: "If you want to come a night before, choose Standard or Superior, then Single or Shared occupancy.",
        startSeconds: 0,
        endSeconds: 6.3,
      },
      {
        text: "Breakfast is included with the selected night-before stay.",
        startSeconds: 6.3,
        endSeconds: 10.4,
      },
    ],
  },
  {
    id: "review",
    durationInFrames: 352,
    audioFile: "07-review.mp3",
    audioDurationSeconds: 10.075,
    captions: [
      {
        text: "Before submitting, review the buyer, attendee, ticket, and every accommodation charge.",
        startSeconds: 0,
        endSeconds: 5.1,
      },
      {
        text: "Confirm the live total, then complete the verification challenge.",
        startSeconds: 5.1,
        endSeconds: 9.98,
      },
    ],
  },
  {
    id: "confirmation",
    durationInFrames: 423,
    audioFile: "08-confirmation.mp3",
    audioDurationSeconds: 12.45,
    captions: [
      {
        text: "After submission, save your booking reference and complete payment through Tikkie.",
        startSeconds: 0,
        endSeconds: 6,
      },
      {
        text: "A confirmation email will arrive, and Manage Booking lets you review payment progress and booking details later.",
        startSeconds: 6,
        endSeconds: 12.35,
      },
    ],
  },
]

export const storyDurationInFrames = storyScenes.reduce(
  (total, scene) => total + scene.durationInFrames,
  0
)

export const totalDurationInFrames =
  INTRO_DURATION_IN_FRAMES + storyDurationInFrames + OUTRO_DURATION_IN_FRAMES
