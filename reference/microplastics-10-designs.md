# 10 Engineering Designs for Getting Rid of Microplastics

Ten real, buildable mechanical-engineering designs spanning the whole microplastic
chain: stop it at the source, intercept it in transit, remove it from water and
sand, and destroy it at the end of the line. Each entry notes how it works, the
core engineering challenge, and what prior art exists (so you know what's genuinely
new vs. what's an upgrade of something proven).

Concept renders were AI-generated to visualize each design.

---

## Stop it at the source

### 1. Self-cleaning cyclonic laundry filter

![Cyclonic laundry filter](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131831_6d1f4deb-ea6e-427e-8fe2-e02ff5a47370.png)

**Problem:** A single wash load sheds hundreds of thousands of synthetic microfibers —
laundry is one of the biggest household sources.

**Design:** An inline hydrocyclone on the washing machine drain hose. Drain water
enters tangentially, spins, and centrifugal force drives fibers to the wall where
they migrate to a collection cup and are compressed into a dry "lint puck" the user
empties monthly. No mesh cartridge, so nothing clogs and there are no consumables.

**Engineering core:** CFD-tuning the cone geometry for low-density flexible fibers
(much harder to cyclone-separate than dense grit), and a passive puck-compaction
mechanism driven by the pump's own pressure.

**Prior art:** France mandates washer filters (first such law); existing products
(PlanetCare, Filtrol) are clog-prone mesh cartridges with consumable inserts. The
self-cleaning cyclone version is the open design problem.

### 2. Wheel-arch tire-wear particle collector

![Tire particle collector](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131834_d8715735-985f-43c0-9a45-3bbb6412202a.png)

**Problem:** Tire wear is one of the largest single sources of microplastics
(estimates put it near a quarter or more of ocean microplastic mass). Nobody
captures it.

**Design:** An aerodynamic duct built into the wheel-arch liner that uses the
airflow the spinning tire already generates, plus electrostatically charged plates,
to pull freshly shed (naturally charged) rubber particles into a swappable cassette
changed at oil-change intervals. Captured rubber can be devulcanized and reused.

**Engineering core:** CFD of rotating-wheel airflow per vehicle platform, plate
geometry that survives road grime and water, and zero measurable drag penalty.

**Prior art:** The Tyre Collective (UK startup) has proven electrostatic capture in
prototypes. Making it a robust, OEM-integratable liner module is wide open.

## Intercept it in transit

### 3. Storm-drain vortex separator insert

![Storm drain vortex insert](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131836_4dcf9c95-9a9b-43e8-b1fa-b1bb8fa34dad.png)

**Problem:** The tire and road particles that escape design #2 wash off roads into
storm drains and go straight to rivers untreated.

**Design:** A drop-in stainless insert for existing curb inlets: incoming runoff is
forced into a spiral, dense tire/road particles settle into a removable basket,
clean water exits over a weir. Sized so a municipal vac truck services it on the
existing street-sweeping schedule. Passive — no power, no moving parts.

**Engineering core:** Hitting real separation efficiency at storm-surge flow rates
without becoming a flooding hazard when full — a bypass weir that never blocks is
the safety-critical bit. Parametric CAD lets every insert auto-fit each city's
inlet dimensions.

**Prior art:** Large vortex separators (CDS units) exist for new construction;
cheap retrofit inserts for the millions of existing curb inlets don't.

### 4. Angled bubble-curtain river barrier with quay-side collection gutter

![Bubble curtain river barrier](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_132413_256654c0-47c3-4adf-bd8c-0a89b7143c08.png)

**Problem:** Rivers are the conveyor belt carrying land microplastics to the sea.
Nets and booms block boats and fish and miss small particles.

**Design:** A perforated tube on the riverbed laid diagonally across the channel.
Rising bubbles create an upward+lateral current that lifts suspended particles and
herds them to a skimming gutter along the quay wall. Boats and fish pass freely.

**Engineering core:** Diffuser hole size/spacing tuned (via two-phase CFD) to lift
sub-millimeter particles, not just floating litter — bubble size is the whole game.
Compressor energy per kg captured is the metric to optimize.

**Prior art:** The Great Bubble Barrier operates in Amsterdam and Katwijk for
macro-plastic. A micro-scale-optimized version with engineered collection
hydraulics is the next step nobody has shipped.

## Remove it from water

### 5. Acoustic standing-wave concentrator (filterless separation)

![Acoustic separator module](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131841_073e29aa-e7de-45a9-9682-9e48848c3a2e.png)

**Problem:** Every mesh/membrane fine enough to catch microplastics clogs, and
backwashing wastes water and energy.

**Design:** A flow channel with ultrasonic transducers creating a standing wave;
acoustic radiation force pushes particles into the pressure nodes, concentrating
them into thin streamlines that a narrow side-outlet continuously siphons off.
Nothing to clog — the "filter" is a sound field. Modules stack in parallel for
plant-scale flow.

**Engineering core:** Scaling from lab microfluidics to real flow rates: channel
resonance design, transducer placement, and energy per m³ treated. A classic
simulation-driven (acoustics + CFD) CAD problem.

**Prior art:** Acoustofluidic separation is proven in lab papers and used in
biotech cell handling. Nobody has productized it for water treatment.

### 6. 3D-printed microbubble diffusers for dissolved-air flotation

![DAF microbubble diffuser retrofit](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_132414_a1c38231-c3ac-495c-9e2a-7d697a5a68b1.png)

**Problem:** Wastewater plants already capture ~90%+ of microplastics, but the
smallest particles (the most biologically dangerous) slip through, and DAF
performance is limited by bubble size.

**Design:** Topology-optimized, 3D-printed lattice diffuser plates that produce a
dense, uniform cloud of far finer bubbles than drilled plates, tuned so bubble
diameter matches the target particle size for attachment. A retrofit — drop into
existing DAF tanks, no new civil works.

**Engineering core:** Lattice channel geometry controlling bubble detachment
diameter; printed in chemically resistant polymer or sintered steel.

**Prior art:** DAF is a century old; printed engineered-porosity diffusers
targeting microplastic-scale bubbles are essentially untouched.

### 7. Magnetic-seeding drum separator

![Magnetic drum separator](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_132417_3631d594-f9c7-4fc3-9cd8-f211196f887b.png)

**Problem:** Particles below ~10 µm defeat almost every mechanical separation
method.

**Design:** Dose water with surface-functionalized iron-oxide (magnetite)
nanoparticles that preferentially bind plastic surfaces, then run the flow past a
rotating magnetic drum that lifts out the magnetite-plastic clusters and scrapes
them into a hopper. The magnetite is stripped and recirculated in a closed loop.

**Engineering core:** The mechanical side is mature (mining uses magnetic drums at
huge scale); the engineering problem is the recovery loop — separating plastic from
magnetite efficiently enough that the seed material recycles hundreds of times.

**Prior art:** Fionn Ferreira's ferrofluid method won the 2019 Google Science Fair
and is being developed; a continuous-flow industrial drum implementation with
closed-loop seeding is the unbuilt machine.

## Clean up what's already out there

### 8. Beach sand comb-and-winnow rover

![Beach cleaning rover](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_132418_458a6c71-58bc-4e6f-ae4d-69cbee39c0fc.png)

**Problem:** Beach sand is now a microplastic reservoir; existing beach cleaners
rake up bottles and cigarette butts but ignore 1–5 mm fragments.

**Design:** A slow, solar-electric autonomous rover that lifts the top ~5 cm of
sand, passes it over a vibrating screen, then through an air-knife zigzag winnower
that separates light plastic fragments from dense sand grains, and lays the clean
sand back down. Runs at night/off-season on a survey grid.

**Engineering core:** The winnowing air-column design (density separation of
irregular wet-ish particles), sand-handling wear, and keeping ground pressure low
enough to be dune-safe. Every subsystem is simulation-friendly CAD work.

**Prior art:** BeBot (electric beach cleaner) sieves to ~1 cm at best. Fragment-scale
density separation on a rover doesn't exist.

## Destroy it at the end of the line

### 9. Containerized sludge pyrolysis (the microplastic endpoint)

![Sludge pyrolysis unit](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131903_6ed7b0a4-38af-47f9-bffa-66fea0baad4a.png)

**Problem:** The dirty secret of "wastewater plants capture 90% of microplastics":
the captured plastic ends up in sewage sludge, which is then spread on farmland as
fertilizer — re-releasing it into soil and food.

**Design:** A shipping-container-scale screw-auger pyrolysis unit that takes dried
sludge pellets, heats them to ~500 °C in an oxygen-free chamber (destroying the
polymers), and outputs biochar that still carries the fertilizer value (phosphorus)
without the plastic. Syngas from the process fuels its own heating.

**Engineering core:** Auger design for a sticky, abrasive, variable feedstock;
thermal integration so the unit is energy-self-sufficient; containerization so
small plants can afford one.

**Prior art:** Sludge pyrolysis exists at a handful of large plants (e.g. in
Germany and Japan). Cheap containerized units sized for the thousands of small
municipal plants are the gap — and this single design neutralizes the endpoint of
most other capture methods' waste streams.

### 10. Enzymatic packed-bed polishing reactor

![Enzymatic gyroid reactor](https://d8j0ntlcm91z4.cloudfront.net/user_32iSetbQFY92PpvJEgIu4TFAi2r/hf_20260716_131906_fc4d89bd-a25e-4382-8608-35d07a46e971.png)

**Problem:** Everything above *collects* plastic. The nanoscale fraction — too
small for any mechanical method — needs to be *degraded*.

**Design:** A final polishing column packed with 3D-printed gyroid lattice
scaffolds whose surfaces are coated with immobilized plastic-degrading enzymes
(engineered PETase/cutinase variants). Water percolates through enormous enzyme
surface area; PET nanoplastics are hydrolyzed to benign monomers that can even be
recovered. Scaffolds are reprinted and recoated on a service schedule.

**Engineering core:** The biology exists; the *reactor geometry* is the bottleneck.
Gyroid lattices are the ideal CAD answer: maximum surface area per volume, uniform
flow, printable, and parametrically tunable to the plant's flow rate.

**Prior art:** Enzyme recycling of PET waste is commercializing (Carbios); an
immobilized-enzyme *water polishing* reactor is still a research-paper concept
waiting for a mechanical engineer.

---

## How the ten fit together

| Stage | Designs |
|---|---|
| Source prevention | 1 (laundry), 2 (tires) |
| Transit interception | 3 (storm drains), 4 (rivers) |
| Water removal | 5 (acoustic), 6 (DAF), 7 (magnetic) |
| Environmental cleanup | 8 (beaches) |
| Destruction | 9 (pyrolysis), 10 (enzymatic) |

The highest-leverage pair is **#2 + #3** (tire particles are the biggest untouched
source, and the two designs back each other up), and the most strategically
important single machine is **#9**, because it closes the loop every capture
method currently leaves open.
