# Smart Room Allocation System for Deeper Stack

## Overview

A system to intelligently allocate conference attendees to hotel rooms based on:
- Gender segregation
- Priority/care needs (elderly, disability, families)
- Family grouping
- Roommate preferences
- Manual adjustments

## Tech Stack

- **Database:** SQLite (now) → PostgreSQL (later)
- **Framework:** Next.js with Better Auth
- **Integration:** Ticket Tailor API

---

## Phase 1: Database Schema

### New Models

```prisma
// Allocation priority levels
enum AllocationPriority {
  CRITICAL   // Elderly, disability, special needs
  HIGH       // Families with young children
  NORMAL     // Standard attendees
  LOW        // Flexible grouping
}

// Gender types from ticket type parsing
enum GenderType {
  MALE
  FEMALE
  MIXED      // Family tickets
  UNKNOWN
}

// Family grouping
model AttendeeFamilyGroup {
  id            String   @id @default(cuid())
  primaryAttendeeId String? // Optional link to primary attendee
  label         String?  // Optional label like "Smith Family"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  members      AttendeeFamilyMember[]
}

// Member of a family group
model AttendeeFamilyMember {
  id            String   @id @default(cuid())
  familyGroupId String
  familyGroup   AttendeeFamilyGroup @relation(fields: [familyGroupId], references: [id], onDelete: Cascade)
  attendeeId    String   @unique  // Links to TicketTailorAttendee
  relationship  String?  // "parent", "child", "spouse", "sibling", etc.
  createdAt     DateTime @default(now())
}

// Room allocation
model RoomAllocation {
  id            String   @id @default(cuid())
  eventId       String
  roomId        String
  status        String   @default("proposed")  // proposed, confirmed, rejected
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([eventId, roomId])
  @@index([eventId, status])
}
```

### Extend Existing Models

```prisma
// Extend TicketTailorAttendee
model TicketTailorAttendee {
  // ... existing fields
  
  // Extracted custom answers (set during sync)
  customAnswers   Json?   // { "Gender": "Female", "Location": "Amsterdam", "Remarks": "..." }
  
  // Parsed values for allocation
  genderType      GenderType?
  ageGroup        String?  // From ticket type: "adult", "teen", "child", "infant"
  ticketCategory  String?  // Parsed from ticket type name
  
  // Priority for allocation
  allocationPriority AllocationPriority @default(NORMAL)
  priorityReason  String?  // "elderly", "disability", "young_children", etc.
  
  // Family linking
  familyGroupMember AttendeeFamilyMember?
  
  // Room assignment
  assignedRoomId  String?  // References AccommodationRoom
}
```

---

## Phase 2: Sync Integration

### Auto-Detection During Sync

1. **Parse Ticket Types** → Extract gender, age group
   ```
   "Male 18+"     → genderType: MALE, ageGroup: adult
   "Female 18+"   → genderType: FEMALE, ageGroup: adult
   "Mixed Family"  → genderType: MIXED, ageGroup: mixed
   "Teen 13-17"   → genderType: UNKNOWN, ageGroup: teen
   ```

2. **Extract Custom Answers** from `custom_questions`
   ```typescript
   // Map Ticket Tailor question to key
   const ANSWER_KEYS = {
     "Gender": "gender",
     "What is your gender?": "gender",
     "Location": "location",
     "What is your location?": "location",
     "Remarks": "remarks",
     "Any remarks?": "remarks",
     "Room preferences": "roomPreferences",
     "Dietary requirements": "dietary",
   }
   ```

3. **Auto-Detect Priority** from remarks/custom answers
   ```typescript
   const PRIORITY_KEYWORDS = {
     CRITICAL: ["wheelchair", "elderly", "mobility", "disability", "accessible"],
     HIGH: ["baby", "toddler", "young children", "infant", "pregnant"],
     HIGH: ["need roommate", "prefer roommate"],
   }
   ```

4. **Link Family Members** (same order_id)
   - Auto-create family group for all attendees in same order
   - Parse relationship from ticket type names ("Parent", "Child")

---

## Phase 3: Allocation Algorithm

### Priority Order

1. **CRITICAL** - Allocate first (special needs)
2. **HIGH** - Families with young children
3. **HIGH** - Roommate preferences
4. **NORMAL** - Standard attendees
5. **LOW** - Flexible grouping

### Gender Rules

- Male rooms: Only male ticket types
- Female rooms: Only female ticket types
- Family rooms: Mixed gender allowed (family tickets)
- Exceptions: Admin can override

### Room Type Matching

```typescript
function suggestRoom(attendee, availableRooms) {
  // 1. Filter by gender compatibility
  const genderCompatible = availableRooms.filter(room => 
    isGenderCompatible(attendee.genderType, room.genderType)
  )
  
  // 2. Filter by capacity
  const withCapacity = genderCompatible.filter(room =>
    room.occupiedBeds < room.capacity
  )
  
  // 3. Prioritize matching priority
  const sorted = withCapacity.sort((a, b) => 
    a.allocationPriority - b.allocationPriority
  )
  
  return sorted[0]
}
```

### Manual Overrides

- Drag-and-drop between rooms
- Manual family group creation
- Force mixed gender room
- Split family across rooms

---

## Phase 4: API Routes

### Attendance & Allocation

```
GET  /api/dashboard/events/[eventId]/attendees
     → Returns attendees with customAnswers, genderType, priority

GET  /api/dashboard/events/[eventId]/allocation
     → Returns current room allocations

POST /api/dashboard/events/[eventId]/allocation/auto
     → Run auto-allocation algorithm

PUT  /api/dashboard/events/[eventId]/allocation/rooms/[roomId]/assign
     → Assign attendee to room
     → Body: { attendeeId, notes? }

POST /api/dashboard/events/[eventId]/family-groups
     → Create family group
     → Body: { label?, members: [{attendeeId, relationship}] }

PUT  /api/dashboard/events/[eventId]/attendees/[attendeeId]/priority
     → Update priority
     → Body: { priority, reason }
```

---

## Phase 5: UI Components

### Attendee List View
- Table with columns: Name, Gender, Age Group, Priority, Room Status
- Filter by gender, priority, room assignment
- Sort by priority (CRITICAL first)

### Room Allocation Board
- Grid of rooms (drag-and-drop)
- Attendee cards with priority badges
- Visual indicators for family groups
- Gender icons on rooms

### Priority Editor
- Quick-select priority dropdown
- Auto-detected reason shown
- Manual override option

### Family Group Manager
- Create/edit family groups
- Search and add attendees
- Link attendees from different orders

---

## Implementation Order

### Step 1: Database Schema ✅
- [x] Add new models to schema.prisma
- [x] Add fields to TicketTailorAttendee
- [x] Run `prisma db push`

### Step 2: Custom Answer Extraction ✅
- [x] Create `lib/domain/ticket-tailor/custom-answers.ts`
- [x] Add ticket type parsing logic
- [x] Add custom question extraction
- [x] Add priority auto-detection
- [x] Create tests for all functions

### Step 3: Sync Integration ✅
- [x] Update `sync.ts` to extract and store custom answers
- [x] Update `sync.ts` to parse ticket types
- [x] Update `sync.ts` to auto-detect priority
- [x] Update `sync.ts` to link family members (same order)

### Step 4: Allocation Domain [TODO]
- [ ] Create `lib/domain/allocation/algorithm.ts`
- [ ] Create `lib/domain/allocation/family-groups.ts`

### Step 5: API Routes [TODO]
- [ ] Create family group CRUD routes
- [ ] Create allocation routes
- [ ] Add priority update routes

### Step 6: UI Components [TODO]
- [ ] Attendee list with custom columns
- [ ] Priority badges
- [ ] Room allocation board
- [ ] Family group manager

### Step 7: Testing [TODO]
- [x] Test custom answer extraction
- [x] Test ticket type parsing
- [ ] Test allocation algorithm
- [ ] Test family grouping

---

## Ticket Tailor Questions Setup

Configure these custom questions in Ticket Tailor:

| Question | Purpose |
|----------|---------|
| Gender | Male, Female, Other |
| Location | City/Region |
| Remarks | Roommate preferences, dietary needs, special requirements |

*Note: Priority flags (elderly, disability) can be inferred from Remarks text.*

---

## Future: PostgreSQL Migration

The schema is designed to be PostgreSQL-compatible:

- JSON fields work in both SQLite and PostgreSQL
- Enums map directly to PostgreSQL enums
- `array_contains` queries available in PostgreSQL for fast filtering

Migration path:
```bash
# When ready to migrate
npx prisma migrate dev --name migrate_to_postgres
```
