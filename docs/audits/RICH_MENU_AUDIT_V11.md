# PRMS-TSM Rich Menu Audit — Final V11

## Findings from the uploaded code

- The workflow logic is broad and covers guest, owner, pet, health, status, request, profile, location, transfer, and resubmission paths.
- The current visual layout is the main weakness: it uses a uniform 3×3 grid, mixes workflow choices with navigation, changes colors by position rather than meaning, and leaves large empty areas on pages with fewer choices.
- Pagination has a correctness bug for long lists: the previous-page offset can jump to the wrong start after the second page.
- Village choices are truncated to the first 12 records even though the Rich Menu wizard can paginate.
- Status flows show pets that are not eligible for the selected status, then fail only after selection.
- V6 keeps an unnecessary legacy module bridge only to satisfy tests for the old Flex-list UI. Runtime uses V10, but the bridge makes the architecture harder to maintain and risks reintroducing message-list behavior.

## Menu coverage

### Guest
- Register pet
- Track request
- Link existing registration
- How to use
- Contact municipality

### Linked owner
- My pets
- Add pet
- Pet health
- Pet status
- My requests
- Owner information

### Detailed workflows
- Registration: consent, owner, phone, house, village, address, location, species, name, sex, breed, color, birth date, photo, confirmation
- Vaccination: vaccine, date, next due, lot, provider, photo, confirmation
- Sterilization: date, provider, photo, confirmation
- Pet status: missing, found, deceased, transfer
- Pet update and owner transfer
- Owner profile and location
- Request filters, details, resubmission, cancellation
- Back, main menu, cancel, keyboard, date picker, camera, gallery, location

## V11 changes

- Replaces the random 3×3 card grid with a responsive semantic layout.
- Anchors Back / Main menu / Cancel or Refresh in a consistent bottom row.
- Uses semantic colors and vector icons.
- Fixes long-list pagination without skipping or duplicating records.
- Removes the 12-village truncation.
- Filters status pet pickers to eligible pets.
- Removes the legacy Flex-list compatibility bridge.
- Replaces old list-menu tests with full Rich Menu coverage tests.
