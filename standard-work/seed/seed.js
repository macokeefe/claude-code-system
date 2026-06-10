// Seeds the database with the two Sola Lounge SWI workbooks as read from the
// source spreadsheets on 2026-06-10. Times were normalized to seconds where
// the spreadsheet value was unambiguous; ambiguous values (size-dependent
// lists, "/piece" rates) keep their raw text and are marked needs_review.
//
// SKU numbers are placeholders — the spreadsheets don't contain SKU numbers.
import db, { getSkuTotal, recordTimeHistory } from '../server/db.js';

const existing = db.prepare('SELECT COUNT(*) AS n FROM skus').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} SKU(s) — seed skipped. Delete data/standard-work.db to reseed.`);
  process.exit(0);
}

const insertTag = db.prepare('INSERT INTO tags (name, description, canonical_time_seconds) VALUES (?, ?, ?)');
const insertSku = db.prepare('INSERT INTO skus (sku_number, name, family, description, version) VALUES (?, ?, ?, ?, ?)');
const insertStep = db.prepare(`
  INSERT INTO sku_steps (sku_id, sequence, tag_id, name, description, time_seconds, time_raw_text,
                         override_time_seconds, parallel_notes, needs_review)
  VALUES (@sku_id, @sequence, @tag_id, @name, @description, @time_seconds, @time_raw_text,
          @override_time_seconds, @parallel_notes, @needs_review)`);

db.transaction(() => {
  // ---- Shared steps that appear in both Sola workbooks ----
  const tagPpe = insertTag.run('PPE',
    'Use the personal protective equipment as shown before starting the process of making a Sola Sectional Sofa.',
    null).lastInsertRowid;

  const tagConnPre = insertTag.run('Connector Pre-Assembly',
    'Place washer onto screw and hand-thread screw lightly into connector. Secure connector in clamp fixture and drive screw fully until seated using drill. Repeat for all remaining screws on connector. Approximately 50 seconds per connector — total time scales with connector count.',
    700).lastInsertRowid; // 11.66 min (14 connectors, No Arms baseline)

  const tagConnPlate = insertTag.run('Connector Plate Installation',
    'Secure the leg piece onto the clamp fixture. Check work order to confirm whether piece requires 1 or 2 connectors. Hold connector plate firmly against the connector by hand and slide the assembly into the leg piece. Drill a hole in each of the 4 corners of the plate. Drive one screw into each of the 4 holes until fully seated. Blast area with compressed air to clear debris and remove plate. Repeat all steps if piece requires a 2nd connector. 04:44 for a piece with 2 connectors. 1:48 for a piece with 1 connector.',
    784).lastInsertRowid; // 13:04 (No Arms baseline)

  const tagAttachConn = insertTag.run('Attach Connectors to Leg Pieces',
    'Attach the connectors to the side of each leg piece using a wrench. Place the connector onto the extrusion and hand-tighten the bolts into the pre-drilled holes. Slide the outer casing over the connector for alignment. Use the wrench to fully tighten the bolts. Repeat for all 4 connectors. ~55 seconds per connector.',
    220).lastInsertRowid; // 3 min 40 sec

  const tagSeatSupport = insertTag.run('Seat Support Frame Assembly',
    'Lay out all trellis slats in line (quantity depends on size of sofa) and then the 2 flat bars (length depends on size). Screw in 2 screws on each side of each slat. Make sure all are tight and flush.',
    null).lastInsertRowid;

  const tagFramePrep = insertTag.run('Frame Prep',
    'Lay frame flat on work surface. Inspect all pre-installed screws in the frame and drive any that are not fully seated until flush. Ensure no screws are protruding before proceeding to the next step.',
    null).lastInsertRowid;

  const step = (skuId, seq, fields) => insertStep.run({
    sku_id: skuId, sequence: seq, tag_id: null, name: null, description: null,
    time_seconds: null, time_raw_text: null, override_time_seconds: null,
    parallel_notes: null, needs_review: 0, ...fields,
  });

  // ---- SKU 1: Sola Lounge Right Arm ----
  const rightArm = insertSku.run('SOLA-RA', 'Sola Lounge Right Arm', 'Sola Lounge',
    'Imported from "Sola Lounge rigth arm.xlsx". SKU number is a placeholder.', 1).lastInsertRowid;

  step(rightArm, 1, { tag_id: tagPpe, parallel_notes: 'No' });
  step(rightArm, 2, {
    name: 'Rivet Nut Installation',
    description: 'Inspect each pre-drilled hole on the component to confirm the correct diameter for rivet nut installation. If holes are undersized, use the drill to open each hole to the correct size before proceeding, adding approximately 30 seconds per piece. Secure the component into the clamp fixture. Using the pneumatic rivet nut tool, insert a rivet nut into each hole and pull the trigger to fully set and seat the insert. Install (4) rivnuts into each of the (4) leg pieces. Install rivnuts into the long bars based on sofa size: (4) small, (5) medium, (6) large. Base cycle time of 1 min 20 sec covers one 4-rivnut long bar and all leg pieces; add 10 sec per additional rivnut beyond 4.',
    time_raw_text: '1:36:40/piece', needs_review: 1, parallel_notes: 'No',
  });
  step(rightArm, 3, { tag_id: tagConnPre, override_time_seconds: 800, // 13:20 — 16 connectors vs the 14-connector canonical
    parallel_notes: 'Yes but inefficient' });
  step(rightArm, 4, { tag_id: tagConnPlate, override_time_seconds: 892, // 14:52
    parallel_notes: '2-connector piece could be done in parallel but seems extremely inefficient' });
  step(rightArm, 5, { tag_id: tagAttachConn });
  step(rightArm, 6, {
    name: 'Frame Sub-Assembly',
    description: 'Lay both frame sections flat on the work surface — the 3/4-leg section and the 5-piece section. Apply a bar clamp to each section to hold extrusions flush and aligned. Drive screws into each leg joint using the pre-installed connectors from the previous step until fully seated. Repeat for all joints on both sections. 8:30 for 4-legged piece + 10:30 for 5-legged.',
    time_raw_text: '8:30 + 10:30 (in description)', needs_review: 1,
  });
  step(rightArm, 7, {
    name: 'Frame Assembly',
    description: 'Lay large frame flat on work surface and align pre-assembled sub-sections to their corresponding mounting points. Apply bar clamp to each section to hold extrusions flush and aligned. Insert connectors into designated joints and drive screws through connector points until fully seated using wrench. Remove clamps once all joints are secured and repeat for other side. Verify no extrusions are misaligned before proceeding.',
    time_seconds: 1140, time_raw_text: '19',
  });
  step(rightArm, 8, { tag_id: tagSeatSupport });
  step(rightArm, 9, { tag_id: tagFramePrep });
  step(rightArm, 10, {
    name: 'Leg Assembly Installation',
    description: 'Apply coating to all screws. Align leg piece assembly to the corresponding mounting points on the frame and drive screws until fully seated. Use hammer to make sure frame lies in the exact right way.',
    time_seconds: 795, time_raw_text: '13 minutes 15 seconds',
  });

  // ---- SKU 2: Sola Lounge Middle Leg No Arms ----
  const noArms = insertSku.run('SOLA-NA', 'Sola Lounge Middle Leg No Arms', 'Sola Lounge',
    'Imported from "Sola Lounge Middle leg no arms.xlsx". SKU number is a placeholder.', 1).lastInsertRowid;

  step(noArms, 1, { tag_id: tagPpe, parallel_notes: 'No' });
  step(noArms, 2, {
    name: 'Rivet Nut Installation',
    description: 'Inspect each pre-drilled hole on the component to confirm the correct diameter. If holes are undersized, use the drill to open each hole to the correct size before proceeding, adding approximately 30 seconds per piece. Secure each extrusion into the clamp fixture. Using the pneumatic rivet nut tool, insert item #13 (40462) 1/4-20 large flange ribbed nutsert into each hole on the (2) middle arm extrusions and (2) beams. Then repeat using item #14 (40528) 3/8-16 large flange ribbed nutsert for each of the 4 holes on the (2) rear legs. Pass all completed components to the cart for the next station. Size-dependent: 3.5 → 8:10, 4.5–6.5 → 8:30, 7.5 → 8:40.',
    time_raw_text: '3.5: 8:10 / 4.5-6.5: 8:30 / 7.5: 8:40', needs_review: 1, parallel_notes: 'Not enough space',
  });
  step(noArms, 3, { tag_id: tagConnPre, parallel_notes: 'Yes but inefficient + unnecessary' }); // 14 connectors = canonical 11.66 min
  step(noArms, 4, { tag_id: tagConnPlate,
    parallel_notes: '2-connector piece could be done in parallel but seems extremely inefficient' }); // 13:04 = canonical
  step(noArms, 5, { tag_id: tagAttachConn }); // 3 min 40 sec = canonical
  step(noArms, 6, {
    name: 'Frame Sub-Assembly',
    description: 'Lay both frame sections flat on the work surface — the 3/4-leg section and the 5-piece section. Apply a bar clamp to each section to hold extrusions flush and aligned. Drive screws into each leg joint using the pre-installed connectors from the previous step until fully seated. Repeat for all joints on both sections. 2x (8:30 for 4-legged piece).',
    time_seconds: 1020, time_raw_text: '17',
  });
  step(noArms, 7, {
    name: 'Frame Connection Assembly',
    description: 'Gather both side assemblies and long connecting pieces. Hammer any rivnuts that are sticking out into designated locations until fully flush. Wipe down and spray all mating surfaces. Insert back bar into both side assemblies, drive connector screws from the side using drill, hammer into place and tighten with wrench until flush. Flip assembly over and attach back piece to the same side, tightening through the open corner. Repeat for opposite side. (MISSING TOP BAR INSTALLATION) +1 minute gathering (not included).',
    time_seconds: 637, time_raw_text: '10:37', needs_review: 1,
  });
  step(noArms, 8, {
    name: 'Middle Leg Sub-Assembly',
    description: 'Gather 2 short leg extrusions and 1 medium leg extrusion. Mate each leg joint by inserting pre-installed connectors into designated receiving holes on adjoining extrusions. Attach bolts and washers on the receiving side of each connector. Hammer until fully flush, apply bar clamp, then tighten all joints using wrench. Position completed middle leg assembly against the underside of the sofa frame, aligning the 2 openings with the 2 connectors on the frame. Insert screws from the outside into each connector. Apply bar clamp, hammer until fully flush, then tighten using wrench followed by drill until fully seated.',
    time_seconds: 200, time_raw_text: '3 minutes 20 seconds',
  });
  step(noArms, 9, {
    name: 'Corner Cap & End Cap Installation',
    description: 'Touch up any unpainted edges on the corner using paint. Verify connector is fully tightened and legs are properly aligned. Insert black triangular interior cap into the open corner joint, hammer into place until flush, and fill with super glue. Press exterior cap firmly on top until fully seated. Repeat for all corners. Once the interior cap is glued, top access to the connector is blocked — final tightening must be done from below with a long tool. 100 seconds/corner. NOT INCLUDING THE BOTTOM CAPS (might be the same).',
    time_seconds: 400, time_raw_text: '6.66 minutes', needs_review: 1,
  });
  step(noArms, 10, { tag_id: tagSeatSupport });
  step(noArms, 11, { tag_id: tagFramePrep });
  step(noArms, 12, {
    name: 'Seat Frame Installation',
    description: 'Align seat support frame to the corresponding mounting points on the back and front bars, and drive screws until fully seated. Use hammer to adjust to be fully flush before and as you screw the screws in. Screw the crucial screws into the corners, then proceed with the rest. Use drill.',
    time_seconds: 795, time_raw_text: '13 minutes 15 seconds',
  });

  console.log('Seeded:');
  for (const sku of db.prepare('SELECT * FROM skus').all()) {
    const total = getSkuTotal(sku.id);
    console.log(`  ${sku.sku_number}  ${sku.name}  — total ${Math.floor(total / 60)}m ${total % 60}s`);
  }
  console.log(`  ${db.prepare('SELECT COUNT(*) AS n FROM tags').get().n} shared tags`);
})();
