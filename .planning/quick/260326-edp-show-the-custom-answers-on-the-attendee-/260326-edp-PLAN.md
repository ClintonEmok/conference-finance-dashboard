---
phase: quick-260326-edp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/dashboard/attendees/[attendeeId]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Custom answers from Ticket Tailor (location, remarks, dietary, roommate preference) are displayed on attendee detail page"
  artifacts:
    - path: "app/dashboard/attendees/[attendeeId]/page.tsx"
      provides: "Attendee detail page with signals displayed"
      min_lines: 900
  key_links:
    - from: "AttendeeDetailPayload.signals"
      to: "page UI"
      via: "Render signals in Attendee snapshot card"
      pattern: "signals\\..*"
---

<objective>
Display the custom answers (signals) on the attendee detail page.

The backend already returns signals data (genderType, location, remarks, dietary,
roommatePreference, allocationPriority, priorityReason, ageGroup, ticketCategory)
via getAttendeeDetail(). The frontend type is just missing the signals field.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@lib/domain/finance/attendee-detail.ts (shows signals type at lines 39-49)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add signals type to frontend and render in UI</name>
  <files>app/dashboard/attendees/[attendeeId]/page.tsx</files>
  <action>
Add the `signals` field to the `AttendeeDetailPayload` type definition. The type should match the backend signals object:
- genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
- location: string | null
- remarks: string | null
- dietary: string | null
- roommatePreference: string | null
- allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
- priorityReason: string | null
- ageGroup: string | null
- ticketCategory: string | null

Then render these in the "Attendee snapshot" card (around line 789-816). Add a new section
after the existing attendee fields that displays the signals. Use the existing pattern:

- Label in uppercase tracking-wider text-muted-foreground
- Value in font-medium text-foreground
- Icon from lucide-react for visual consistency

Include relevant icons: MapPin (location), FileText (remarks), Utensils (dietary),
Users (roommatePreference), Flag (allocationPriority), Clock (priorityReason),
Calendar (ageGroup), Tag (ticketCategory).
</action>
<verify>
Open the attendee detail page for any attendee. The "Attendee snapshot" card should now
show additional fields: Location, Remarks, Dietary, Roommate Preference, Allocation Priority,
Priority Reason, Age Group, and Ticket Category - populated from custom answers.
</verify>
<done>Attendee detail page displays signals/custom answers from Ticket Tailor</done>
</task>

</tasks>

<verification>
The page loads without TypeScript errors. The signals data from the API response is 
rendered in the UI alongside other attendee information.
</verification>

<success_criteria>
Custom answers (location, remarks, dietary, roommate preference, etc.) are visible on
the attendee detail page in the Attendee snapshot section.
</success_criteria>

<output>
After completion, create `.planning/quick/260326-edp-show-the-custom-answers-on-the-attendee-/260326-edp-01-SUMMARY.md`
</output>
