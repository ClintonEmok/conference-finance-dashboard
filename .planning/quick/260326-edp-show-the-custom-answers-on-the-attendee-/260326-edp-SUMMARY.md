# Quick Task 260326-edp: Show Custom Answers on Attendee Detail Page

**Completed:** 2026-03-26

## Summary

Added display of Ticket Tailor custom answers (signals) to the attendee detail page. The backend already returned this data but the frontend wasn't rendering it.

## Changes Made

### 1. Updated `app/dashboard/attendees/[attendeeId]/page.tsx`

- Added `signals` type to `AttendeeDetailPayload` with fields:
  - genderType, location, remarks, dietary, roommatePreference
  - allocationPriority, priorityReason, ageGroup, ticketCategory

- Added new lucide-react icons: MapPin, FileText, Utensils, Users, Flag, Clock, Calendar, Tag

- Added "Custom Answers" card that displays only non-null signals:
  - Location (MapPin icon)
  - Remarks (FileText icon)
  - Dietary (Utensils icon)
  - Roommate preference (Users icon)
  - Allocation priority (Flag icon)
  - Priority reason (Clock icon)
  - Age group (Calendar icon)
  - Ticket category (Tag icon)

## Verification

- TypeScript compilation passes for the edited file
- UI conditionally renders only when signals are present
- Uses existing card styling pattern from "Attendee snapshot" section
