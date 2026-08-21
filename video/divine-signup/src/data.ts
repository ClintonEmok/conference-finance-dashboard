export const VIDEO_FPS = 30
export const AUDIO_DELAY_FRAMES = 20

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
    durationInFrames: 291,
    audioFile: "01-welcome.mp3",
    audioDurationSeconds: 8.071156,
    captions: [
      {
        text: "Welcome to the Divine Redesign signup guide.",
        startSeconds: 0,
        endSeconds: 3.2,
      },
      {
        text: "We will walk through each live registration step, from choosing a ticket to completing your payment.",
        startSeconds: 3.2,
        endSeconds: 8,
      },
    ],
  },
  {
    id: "tickets",
    durationInFrames: 326,
    audioFile: "02-tickets.mp3",
    audioDurationSeconds: 9.242404,
    captions: [
      {
        text: "Start by choosing one ticket for each attendee.",
        startSeconds: 0,
        endSeconds: 3.5,
      },
      {
        text: "Tickets range from free admission for children under three to three hundred and fifty euros for a Single Room ticket.",
        startSeconds: 3.5,
        endSeconds: 9.18,
      },
    ],
  },
  {
    id: "details",
    durationInFrames: 388,
    audioFile: "03-details.mp3",
    audioDurationSeconds: 11.339274,
    captions: [
      {
        text: "Next, enter the buyer's full name, email address, and phone number.",
        startSeconds: 0,
        endSeconds: 5.3,
      },
      {
        text: "Then complete each attendee's name, gender, location, and any optional contact or room details.",
        startSeconds: 5.3,
        endSeconds: 11.27,
      },
    ],
  },
  {
    id: "included",
    durationInFrames: 319,
    audioFile: "04-included-stay.mp3",
    audioDurationSeconds: 9.030159,
    captions: [
      {
        text: "The Single Room ticket includes a Standard single room for two nights.",
        startSeconds: 0,
        endSeconds: 4.65,
      },
      {
        text: "Your ticket sets the occupancy, and the organizer confirms the final room placement.",
        startSeconds: 4.65,
        endSeconds: 8.96,
      },
    ],
  },
  {
    id: "options",
    durationInFrames: 356,
    audioFile: "05-options.mp3",
    audioDurationSeconds: 10.243175,
    captions: [
      {
        text: "On the accommodation step, add a cot by choosing the quantity and number of nights.",
        startSeconds: 0,
        endSeconds: 5.1,
      },
      {
        text: "You may also upgrade the included stay to Superior for ten euros per person, per night.",
        startSeconds: 5.1,
        endSeconds: 10.18,
      },
    ],
  },
  {
    id: "nightBefore",
    durationInFrames: 311,
    audioFile: "06-night-before.mp3",
    audioDurationSeconds: 8.745488,
    captions: [
      {
        text: "If you need the night before, choose Standard or Superior, then Single or Shared occupancy.",
        startSeconds: 0,
        endSeconds: 5.2,
      },
      {
        text: "Breakfast is included with the selected night-before stay.",
        startSeconds: 5.2,
        endSeconds: 8.68,
      },
    ],
  },
  {
    id: "review",
    durationInFrames: 352,
    audioFile: "07-review.mp3",
    audioDurationSeconds: 10.137959,
    captions: [
      {
        text: "Before submitting, review the buyer, attendee, ticket, and every accommodation charge.",
        startSeconds: 0,
        endSeconds: 5.1,
      },
      {
        text: "Confirm the live total, then complete the verification challenge.",
        startSeconds: 5.1,
        endSeconds: 10.07,
      },
    ],
  },
  {
    id: "confirmation",
    durationInFrames: 375,
    audioFile: "08-confirmation.mp3",
    audioDurationSeconds: 10.889297,
    captions: [
      {
        text: "After submission, save your booking reference and complete payment through Tikkie.",
        startSeconds: 0,
        endSeconds: 5.2,
      },
      {
        text: "A confirmation email will arrive, and Manage Booking lets you review payment progress and booking details later.",
        startSeconds: 5.2,
        endSeconds: 10.82,
      },
    ],
  },
]

export const totalDurationInFrames = storyScenes.reduce(
  (total, scene) => total + scene.durationInFrames,
  0
)
