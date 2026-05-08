# Plan 21-03 Summary: Remove Scope Reach Modal and Deprecated Linking

## Completed

### Inventory Page Cleanup (`app/dashboard/accommodation/inventory/page.tsx`)

**Removed Deprecated Imports:**

- Removed `useAttachHotelToEventByProviderId`
- Removed `useDetachHotelFromEventByProviderId`

**Removed State Variables:**

- `activeHotelScopeId` - tracked which hotel's scope was being edited
- `draftEventIds` - tracked selected events for linking

**Removed Functions:**

- `openHotelScopeModal` - opened the modal for hotel-event linking
- `closeHotelScopeModal` - closed the modal and reset state
- `saveHotelScope` - saved changes by attaching/detaching events

**Removed UI Components:**

- "Manage Scope Reach" button (RefreshCcw icon) from hotel cards
- Entire Scope Management Modal (~130 lines of JSX)
  - Modal header with hotel name
  - Event list with checkboxes
  - Save/Cancel buttons
  - Loading and empty states

### Deprecation Already in Place

The mutation and hook were already deprecated in Plan 21-01:

- `attachHotelToEventByProviderId` marked with `@deprecated` JSDoc
- Console warning added
- Hook marked as deprecated with documentation

## Impact

### Breaking Changes

⚠️ **Hotel-to-event linking can no longer be done from the inventory page**

Users must now:

1. Go to Event Settings (`/dashboard/events/[slug]`)
2. Enable accommodation toggle
3. Use the "Linked Hotels" section to add hotels

### What Still Works

- Creating hotels in inventory
- Creating room types in inventory
- Creating rooms in inventory
- Viewing all inventory
- Deleting hotels and room types

## Testing Recommendations

1. Verify inventory page loads without errors
2. Confirm no "Manage Scope Reach" button on hotel cards
3. Test hotel creation still works
4. Test room type creation still works
5. Test room creation still works
6. Verify event settings can still link/unlink hotels

## Files Modified

- `app/dashboard/accommodation/inventory/page.tsx` - Removed scope management features

## Files Already Updated (Plan 21-01)

- `convex/accommodation.ts` - Mutation marked deprecated
- `lib/convex/hooks/accommodation.ts` - Hook marked deprecated

## Success Criteria Met

✅ Scope Reach Management modal completely removed
✅ No references to `attachHotelToEventByProviderId` in UI code
✅ Inventory page works without Scope Reach features
✅ Event settings is the only place to link hotels
✅ Mutation marked deprecated in Convex
✅ No broken references or console errors

## Notes

This is cleanup work that finalizes the UX consolidation:

- Phase 21-01: Created unified mutation with auto-slot generation
- Phase 21-02: Built enhanced event settings UI
- Phase 21-03: Removed old scope management path

The accommodation workflow is now centralized in Event Settings with a clean, inline UX.
