# fac-d61-2026-10-12 — recorded Find-A-Club meeting vocabulary (#1789)

`meeting-vocabulary.json` is the `MeetingDay`, `MeetingTime`, `Location` and
`AllowsVirtualAttendance` of every club in one real FAC response:
`gs://toast-stats-data-staging/raw-fac/2026-10-12/district_61.json`
(167 clubs, read once, read-only). Club ids, names and every other field are
omitted, and the rows keep the response order.

The free text is verbatim except for personal or access data, which is
replaced by synthetic placeholders of the same shape:

- emails → `club-contact@example.org`
- phone numbers → `555-0100`
- online meeting links → `https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER`
- other URLs → `https://example.toastmastersclubs.org/`

So the fixture exercises the scrubber on real positions and punctuation
without carrying anyone's contact details or a working meeting link.
