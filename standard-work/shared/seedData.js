// Data extracted from the two Sola Lounge SWI workbooks on 2026-06-10.
// Times normalized to seconds where unambiguous; ambiguous values keep their
// raw text and are marked needsReview. Used by both the server seed script
// and the standalone (browser) build's first-run initialization.
// SKU numbers are placeholders — the spreadsheets don't contain SKU numbers.

export const seedTags = [
  {
    name: 'PPE',
    description: 'Use the personal protective equipment as shown before starting the process of making a Sola Sectional Sofa.',
    seconds: null,
  },
  {
    name: 'Connector Pre-Assembly',
    description: 'Place washer onto screw and hand-thread screw lightly into connector. Secure connector in clamp fixture and drive screw fully until seated using drill. Repeat for all remaining screws on connector. Total time scales with connector count.',
    seconds: null,
    unitSeconds: 50, unitLabel: 'connector', // each SKU sets its own connector count
  },
  {
    name: 'Connector Plate Installation',
    description: 'Secure the leg piece onto the clamp fixture. Check work order to confirm whether piece requires 1 or 2 connectors. Hold connector plate firmly against the connector by hand and slide the assembly into the leg piece. Drill a hole in each of the 4 corners of the plate. Drive one screw into each of the 4 holes until fully seated. Blast area with compressed air to clear debris and remove plate. Repeat all steps if piece requires a 2nd connector. 04:44 for a piece with 2 connectors. 1:48 for a piece with 1 connector.',
    seconds: 784, // 13:04 (No Arms baseline)
  },
  {
    name: 'Attach Connectors to Leg Pieces',
    description: 'Attach the connectors to the side of each leg piece using a wrench. Place the connector onto the extrusion and hand-tighten the bolts into the pre-drilled holes. Slide the outer casing over the connector for alignment. Use the wrench to fully tighten the bolts. Repeat for all connectors.',
    seconds: null,
    unitSeconds: 55, unitLabel: 'connector',
  },
  {
    name: 'Seat Support Frame Assembly',
    description: 'Lay out all trellis slats in line (quantity depends on size of sofa) and then the 2 flat bars (length depends on size). Screw in 2 screws on each side of each slat. Make sure all are tight and flush.',
    seconds: null,
  },
  {
    name: 'Frame Prep',
    description: 'Lay frame flat on work surface. Inspect all pre-installed screws in the frame and drive any that are not fully seated until flush. Ensure no screws are protruding before proceeding to the next step.',
    seconds: null,
  },
];

export const seedSkus = [
  {
    sku_number: 'SOLA-RA',
    name: 'Sola Lounge Right Arm',
    family: 'Sola Lounge',
    description: 'Imported from "Sola Lounge rigth arm.xlsx". SKU number is a placeholder.',
    steps: [
      { tag: 'PPE', parallel: 'No' },
      {
        name: 'Rivet Nut Installation',
        description: 'Rear legs: 4× item #14 (40528, 3/8-16) into the rear-left leg and 4× into the rear-right leg; front-left and front-right take none — 8 leg rivnuts at ~0:32 (0.531 min) each. Front & back beams: by sofa size — small (3.5) = 4 per beam (8 total), medium (4.5–6.5) = 5 per beam (10 total), large (7.5) = 6 per beam (12 total). Total 16 / 18 / 20 rivnuts. Secure each extrusion in the clamp fixture and set each insert with the pneumatic rivnut tool.',
        seconds: 573, sizeTimes: { '3.5': 510, '4.5–6.5': 573, '7.5': 637 }, parallel: 'No',
      },
      { tag: 'Connector Pre-Assembly', quantity: 16, // 16 × 0:50 = 13:20
        parallel: 'Yes but inefficient' },
      { tag: 'Connector Plate Installation', override: 892, // 14:52
        parallel: '2-connector piece could be done in parallel but seems extremely inefficient' },
      { tag: 'Attach Connectors to Leg Pieces', quantity: 4 }, // 4 × 0:55 = 3:40
      {
        name: 'Frame Sub-Assembly',
        description: 'Lay both frame sections flat on the work surface — the 3/4-leg section and the 5-piece section. Apply a bar clamp to each section to hold extrusions flush and aligned. Drive screws into each leg joint using the pre-installed connectors from the previous step until fully seated. Repeat for all joints on both sections. 8:30 for 4-legged piece + 10:30 for 5-legged.',
        seconds: 1140, raw: '8:30 + 10:30',
      },
      {
        name: 'Frame Assembly',
        description: 'Lay large frame flat on work surface and align pre-assembled sub-sections to their corresponding mounting points. Apply bar clamp to each section to hold extrusions flush and aligned. Insert connectors into designated joints and drive screws through connector points until fully seated using wrench. Remove clamps once all joints are secured and repeat for other side. Verify no extrusions are misaligned before proceeding.',
        seconds: 1140, raw: '19',
      },
      { tag: 'Seat Support Frame Assembly' },
      { tag: 'Frame Prep' },
      {
        name: 'Leg Assembly Installation',
        description: 'Apply coating to all screws. Align leg piece assembly to the corresponding mounting points on the frame and drive screws until fully seated. Use hammer to make sure frame lies in the exact right way.',
        seconds: 795, raw: '13 minutes 15 seconds',
      },
    ],
  },
  {
    sku_number: 'SOLA-NA',
    name: 'Sola Lounge Middle Leg No Arms',
    family: 'Sola Lounge',
    description: 'Imported from "Sola Lounge Middle leg no arms.xlsx". SKU number is a placeholder.',
    steps: [
      { tag: 'PPE', parallel: 'No' },
      {
        name: 'Rivet Nut Installation',
        description: 'Rear legs: 4× item #14 (40528, 3/8-16) into the rear-left leg and 4× into the rear-right leg; front-left and front-right take none — 8 leg rivnuts at ~0:32 (0.531 min) each. Front & back beams: by sofa size — small (3.5) = 4 per beam (8 total), medium (4.5–6.5) = 5 per beam (10 total), large (7.5) = 6 per beam (12 total). Total 16 / 18 / 20 rivnuts. Secure each extrusion in the clamp fixture and set each insert with the pneumatic rivnut tool.',
        seconds: 573, sizeTimes: { '3.5': 510, '4.5–6.5': 573, '7.5': 637 }, parallel: 'Not enough space',
      },
      { tag: 'Connector Pre-Assembly', quantity: 18, // base 14 + middle leg 4 = 18 × 0:50 = 15:00
        parallel: 'Yes but inefficient + unnecessary' },
      { tag: 'Connector Plate Installation',
        parallel: '2-connector piece could be done in parallel but seems extremely inefficient' }, // 13:04 = canonical
      { tag: 'Attach Connectors to Leg Pieces', quantity: 4 }, // 4 × 0:55 = 3:40
      {
        name: 'Frame Sub-Assembly',
        description: 'Lay both frame sections flat on the work surface — the 3/4-leg section and the 5-piece section. Apply a bar clamp to each section to hold extrusions flush and aligned. Drive screws into each leg joint using the pre-installed connectors from the previous step until fully seated. Repeat for all joints on both sections. 2x (8:30 for 4-legged piece).',
        seconds: 1020, raw: '17',
      },
      {
        name: 'Frame Connection Assembly',
        description: 'Gather both side assemblies and long connecting pieces. Hammer any rivnuts that are sticking out into designated locations until fully flush. Wipe down and spray all mating surfaces. Insert back bar into both side assemblies, drive connector screws from the side using drill, hammer into place and tighten with wrench until flush. Flip assembly over and attach back piece to the same side, tightening through the open corner. Repeat for opposite side. (MISSING TOP BAR INSTALLATION) +1 minute gathering (not included).',
        seconds: 637, raw: '10:37', needsReview: true,
      },
      {
        name: 'Middle Leg Sub-Assembly',
        description: 'Gather 2 short leg extrusions and 1 medium leg extrusion. Mate each leg joint by inserting pre-installed connectors into designated receiving holes on adjoining extrusions. Attach bolts and washers on the receiving side of each connector. Hammer until fully flush, apply bar clamp, then tighten all joints using wrench. Position completed middle leg assembly against the underside of the sofa frame, aligning the 2 openings with the 2 connectors on the frame. Insert screws from the outside into each connector. Apply bar clamp, hammer until fully flush, then tighten using wrench followed by drill until fully seated.',
        seconds: 200, raw: '3 minutes 20 seconds',
      },
      {
        name: 'Corner Cap & End Cap Installation',
        description: 'Touch up any unpainted edges on the corner using paint. Verify connector is fully tightened and legs are properly aligned. Insert black triangular interior cap into the open corner joint, hammer into place until flush, and fill with super glue. Press exterior cap firmly on top until fully seated. Repeat for all corners. Once the interior cap is glued, top access to the connector is blocked — final tightening must be done from below with a long tool. 100 seconds/corner. NOT INCLUDING THE BOTTOM CAPS (might be the same).',
        seconds: 400, raw: '6.66 minutes', needsReview: true,
      },
      { tag: 'Seat Support Frame Assembly' },
      { tag: 'Frame Prep' },
      {
        name: 'Seat Frame Installation',
        description: 'Align seat support frame to the corresponding mounting points on the back and front bars, and drive screws until fully seated. Use hammer to adjust to be fully flush before and as you screw the screws in. Screw the crucial screws into the corners, then proceed with the rest. Use drill.',
        seconds: 795, raw: '13 minutes 15 seconds',
      },
    ],
  },
  {
    // Base configuration: built from the No-Arms config minus the middle-leg
    // sub-assembly, with base connector count 14 (no arms, no middle leg).
    // Constructed from the documented rules — verify on the floor.
    sku_number: 'SOLA-BASE',
    name: 'Sola Lounge No Arms No Middle Leg',
    family: 'Sola Lounge',
    description: 'Base configuration — no arms, no middle leg. Connector count = base 14 (no arm +2 each, no middle leg +4). Constructed from the documented rules; please verify.',
    steps: [
      { tag: 'PPE', parallel: 'No' },
      {
        name: 'Rivet Nut Installation',
        description: 'Rear legs: 4× item #14 (40528, 3/8-16) into the rear-left leg and 4× into the rear-right leg; front-left and front-right take none — 8 leg rivnuts at ~0:32 (0.531 min) each. Front & back beams: by sofa size — small (3.5) = 4 per beam (8 total), medium (4.5–6.5) = 5 per beam (10 total), large (7.5) = 6 per beam (12 total). Total 16 / 18 / 20 rivnuts.',
        seconds: 573, sizeTimes: { '3.5': 510, '4.5–6.5': 573, '7.5': 637 }, parallel: 'No',
      },
      { tag: 'Connector Pre-Assembly', quantity: 14, // base 14 × 0:50 = 11:40
        parallel: 'Yes but inefficient + unnecessary' },
      { tag: 'Connector Plate Installation',
        parallel: '2-connector piece could be done in parallel but seems extremely inefficient' },
      { tag: 'Attach Connectors to Leg Pieces', quantity: 4 }, // 4 × 0:55 = 3:40
      {
        name: 'Frame Sub-Assembly',
        description: 'Lay both frame sections flat on the work surface. Apply a bar clamp to each section to hold extrusions flush and aligned. Drive screws into each leg joint using the pre-installed connectors from the previous step until fully seated. Repeat for all joints on both sections.',
        seconds: 1020, raw: '17',
      },
      {
        name: 'Frame Connection Assembly',
        description: 'Gather both side assemblies and long connecting pieces. Hammer any rivnuts sticking out into designated locations until fully flush. Wipe down and spray all mating surfaces. Insert back bar into both side assemblies, drive connector screws from the side, hammer into place and tighten with wrench until flush. Flip and attach back piece to the same side. Repeat for opposite side.',
        seconds: 637, raw: '10:37',
      },
      {
        name: 'Corner Cap & End Cap Installation',
        description: 'Touch up any unpainted corner edges. Verify connectors are tight and legs aligned. Insert black triangular interior cap into each open corner joint, hammer flush, fill with super glue, press exterior cap on top until seated. Repeat for all corners. ~100 seconds/corner.',
        seconds: 400, raw: '6.66 minutes',
      },
      { tag: 'Seat Support Frame Assembly' },
      { tag: 'Frame Prep' },
      {
        name: 'Seat Frame Installation',
        description: 'Align seat support frame to the corresponding mounting points on the back and front bars, and drive screws until fully seated. Use hammer to adjust to be fully flush. Screw the crucial corner screws first, then the rest. Use drill.',
        seconds: 795, raw: '13 minutes 15 seconds',
      },
    ],
  },
  {
    // Imported from "SWI MeritageSW 3 seater.xlsx" (no-pictures copy, 2026-06).
    // Times are in MINUTES on the sheet (sum 264.25 = stated total); stored as
    // seconds. Precedence below is INFERRED from the step descriptions —
    // confirm/adjust on the Process Map.
    sku_number: 'MERITAGE-3S',
    name: 'MeritageSW 3 Seater',
    family: 'Meritage',
    description: 'Imported from "SWI MeritageSW 3 seater.xlsx". Total process time 264.25 min. SKU number is a placeholder.',
    steps: [
      { tag: 'PPE', parallel: 'No' },
      { name: 'Connector Prep', seconds: 1155, // 19.25 min
        description: 'Swap incorrect screw for correct on 2 classic connectors. Swap incorrect screw for correct on 2 directional connectors. Re-orient left connector from right to left configuration. On 12 small connectors, enlarge holes with 1/2" bit, insert screw through both holes, seat rectangle nut flat-side out, then insert screw with washer into each open space and tighten.' },
      { name: 'Leg Assembly', seconds: 480, // 8 min
        description: 'Lay components flat. Deburr extrusion edges. Press plastic sleeve into each end of extrusion. Drive set screws into dowel pin on both sides. Repeat for all 4 legs.' },
      { name: 'Arms Assembly', seconds: 3840, // 64 min
        description: 'Insert and secure inner spacer pin connectors to outer face of each arm. Tighten connectors at each arm end. Connect vertical side extrusions to completed arm assembly. Tighten through open leg portion with extra-long wrench. Attach top/bottom piece and hammer into place. Tighten corner connector screw. Attach and tighten bars.' },
      { name: 'Seat Frame Assembly', seconds: 2820, // 47 min
        description: 'Insert and tighten connectors into seat frame. Place rings around connectors. Attach side pieces and hammer flush. Tighten with long wrench. Enlarge corner holes. Position 4 leg bases and attach 2 pegs per base. Apply hook screws.' },
      { name: 'Back Frame Assembly', seconds: 2610, // 43.5 min
        description: 'Clamp bottom back bar. Position 3 mini side connectors, insert and drive long screws. Insert connectors on each side, hammer flush, tighten. Adjust hole sizes, paint exposed areas. Attach short sides, tighten through side pieces with long wrench. Insert 10 screws. Connect top extrusion to complete frame. Attach bars to all 10 screws and tighten individually.' },
      { name: 'Attaching Arms', seconds: 1080, // 18 min
        description: 'Mate seat frame pegs to side connectors on arm bottom bar. Hammer flush, tighten with wrench, secure with hook screws. Repeat for second arm.' },
      { name: 'Attaching Back Support', seconds: 300, // 5 min
        description: 'Align pegs to holes, hammer into place. Tighten connector around peg until secure.' },
      { name: 'Leg Finishing', seconds: 480, // 8 min
        description: 'Attach outer shell to each leg. Wrap strap around shell and twist tight until flush. Wrap each leg in bubble wrap, secure with 3 pieces of tape.' },
      { name: 'Seat Support Frame Assembly', seconds: 1950, // 32.5 min
        description: 'Set up holding structure. Lay side frame pieces, insert 6 placeholder screws. Adjust end holes, paint exposed areas. Place first and last flat bars and secure. Place remaining bars, drive 2 screws per side. Complete one side fully before moving to other. Tighten any bars not flush. Remove placeholder screws.' },
      { name: 'Attaching Seat Frame', seconds: 1080, // 18 min
        description: 'Grab support frame and align into place. Insert and tighten each screw, and use hammer if necessary to insert screws into the exact right place.' },
      { name: 'Attach TUUCI Plate', seconds: 60, // 1 min
        description: 'Apply adhesive sheet to TUUCI plate and stick to the piece to finish it. (May arrive with adhesive already applied.)' },
    ],
  },
];

// Build-order dependencies, keyed by SKU number then step sequence → the
// sequences that must finish first. Authoritative per the engineer (2026-06):
//   • Rivet Nut and Connector Pre-Assembly are prerequisite-free (start at t=0).
//   • Connector Plate AND Attach Connectors each need rivnut + connector
//     pre-assembly (two separate branches).
//   • Frame Sub-Assembly ← Connector Plate; Frame (Connection/Assembly) ← Frame Sub.
//   • Seat Support is prerequisite-free; it gates Frame Prep ("seat support
//     prep"), which gates the final seat/trellis installation (also needs the frame).
//   • Corner caps depend on the assembled frame, parallel to the middle leg.
export const seedDeps = {
  'SOLA-RA':   { 4: [2, 3], 5: [2, 3], 6: [4, 5], 7: [6], 9: [8], 10: [9, 7] },
  'SOLA-NA':   { 4: [2, 3], 5: [2, 3], 6: [4, 5], 7: [6], 8: [7], 9: [7], 11: [10], 12: [11, 7] },
  'SOLA-BASE': { 4: [2, 3], 5: [2, 3], 6: [4, 5], 7: [6], 8: [7], 10: [9], 11: [10, 7] },
  // Meritage precedence is INFERRED from the step text — confirm on the map.
  // roots: 2 (connector prep), 3 (legs), 10 (seat support frame).
  'MERITAGE-3S': { 4: [2], 5: [2, 3], 6: [2], 7: [4, 5], 8: [6, 7], 9: [3], 11: [10, 8], 12: [11, 9] },
};

// Bump when seedDeps changes so existing databases re-apply the corrected
// precedence to the seeded Sola SKUs (matched by sku_number + step sequence).
export const PRECEDENCE_VERSION = 3;
