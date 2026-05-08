# Plan 21-01 Summary: Consolidate Hotel Linking + Auto-Slot Generation

## Completed

### Unified `linkHotelToEvent` Mutation

- **Location:** `convex/accommodation.ts` (lines 1214-1345)
- **Changes:**
  - Enhanced to accept either `eventId` or `eventProviderEventId` for flexibility
  - Added `autoGenerateSlots` parameter (defaults to `true`)
  - Integrated logic from `attachHotelToEventByProviderId` for event lookup
  - Returns detailed result: `{ linkId, eventId, hotelId, slotsGenerated, alreadyLinked }`
  - Auto-generates slots for all rooms when linking (if enabled)

### Enhanced `createRooms` Mutation

- **Location:** `convex/accommodation.ts` (lines 924-1020)
- **Changes:**
  - Added `autoGenerateSlots` parameter (defaults to `true`)
  - Auto-generates slots for newly created rooms in all linked events
  - Maintains backward compatibility

### Deprecated `attachHotelToEventByProviderId`

- **Location:** `convex/accommodation.ts` (lines 1479-1528)
- **Changes:**
  - Added `@deprecated` JSDoc annotation
  - Added console.warn on usage
  - Redirects users to unified `linkHotelToEvent`

### Updated Hooks

- **Location:** `lib/convex/hooks/accommodation.ts`
- **Changes:**
  - Enhanced `useLinkHotelToEvent` with detailed documentation
  - Marked `useAttachHotelToEventByProviderId` as deprecated
  - Added console.warn in hook for runtime deprecation notice

## Technical Details

### Auto-Slot Generation Logic

When `autoGenerateSlots` is true (default):

1. After linking hotel to event: Generates slots for all existing rooms
2. After creating rooms: Generates slots for new rooms in all linked events
3. Each slot represents one bed with label format: `{roomLabel}-Bed-{N}`
4. Gender policy defaults to "mixed" (can be changed later)

### Type Safety

- All TypeScript type issues resolved
- Proper casting for string IDs to Convex Id types
- Correct index names used ("hotelId_label" instead of "hotelId")

## Testing Recommendations

1. Test linking hotel to event via canonical eventId
2. Test linking hotel to event via eventProviderEventId (Ticket Tailor ID)
3. Test auto-slot generation when linking (should create slots for all rooms)
4. Test auto-slot generation when creating rooms (should create slots for linked events)
5. Test with `autoGenerateSlots: false` to verify bypass
6. Verify deprecated mutation still works but shows warning

## Files Modified

- `convex/accommodation.ts` - Core mutations
- `lib/convex/hooks/accommodation.ts` - React hooks
- `convex/_generated/*` - Auto-regenerated types

## Breaking Changes

None. The unified mutation is backward compatible with existing `linkHotelToEvent` usage.

## Next Steps

Proceed to Plan 21-02: Redesign Event Settings Accommodation Section (UI changes)
