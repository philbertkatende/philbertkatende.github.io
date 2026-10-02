document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle?.setAttribute("aria-expanded","false");
  }));
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, {threshold: .08});
  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
});
  const val = id => Number(document.getElementById(id)?.value);
  const out = (id, html, kind="") => { const el=document.getElementById(id); if(el){el.innerHTML=html; el.className="tool-result"+(kind?" "+kind:"");} };

  document.getElementById("crcl-calc")?.addEventListener("click",()=>{
    const age=val("crcl-age"), wt=val("crcl-weight"), scr=val("crcl-scr"), sex=document.getElementById("crcl-sex")?.value;
    if(!(age>0&&wt>0&&scr>0)) return out("crcl-result","Please enter age, weight and serum creatinine.");
    let crcl=((140-age)*wt)/(72*scr); if(sex==="female") crcl*=0.85;
    out("crcl-result",`Estimated CrCl: <strong>${crcl.toFixed(1)} mL/min</strong> &nbsp; <span>(Cockcroft–Gault)</span>`);
  });

  document.getElementById("bmi-calc")?.addEventListener("click",()=>{
    const wt=val("bmi-weight"), h=val("bmi-height")/100;
    if(!(wt>0&&h>0)) return out("bmi-result","Please enter weight and height.");
    const bmi=wt/(h*h); let cat=bmi<18.5?"Underweight":bmi<25?"Healthy-weight range":bmi<30?"Overweight":"Obesity range";
    out("bmi-result",`BMI: <strong>${bmi.toFixed(1)}</strong> — ${cat}`);
  });

  document.getElementById("iv-calc")?.addEventListener("click",()=>{
    const vol=val("iv-volume"), hrs=val("iv-time");
    if(!(vol>0&&hrs>0)) return out("iv-result","Please enter volume and time.");
    out("iv-result",`Rate: <strong>${(vol/hrs).toFixed(1)} mL/hour</strong> &nbsp; | &nbsp; ${(vol/(hrs*60)).toFixed(2)} mL/min`);
  });

  document.getElementById("dv-calc")?.addEventListener("click",()=>{
    const dose=val("dv-dose"), strength=val("dv-strength"), vol=val("dv-volume");
    if(!(dose>0&&strength>0&&vol>0)) return out("dv-result","Please enter all three values.");
    out("dv-result",`Volume required: <strong>${((dose/strength)*vol).toFixed(2)} mL</strong>`);
  });

  const ddiPairs=[
    [["warfarin","ibuprofen"],"NSAIDs can increase bleeding risk when combined with warfarin. Review necessity, bleeding risk and monitoring."],
    [["warfarin","aspirin"],"Combined antithrombotic effect can increase bleeding risk. Clinical indication and monitoring should be reviewed."],
    [["sildenafil","nitroglycerin"],"PDE-5 inhibitors and nitrates can cause profound hypotension. This combination requires specialist clinical review."],
    [["simvastatin","clarithromycin"],"Clarithromycin can markedly increase simvastatin exposure. Product-specific contraindications/warnings and alternatives should be checked."],
    [["sertraline","linezolid"],"Linezolid has MAOI activity and can increase serotonin-toxicity risk with serotonergic medicines. Specialist review is required."],
    [["methotrexate","trimethoprim"],"The combination can increase methotrexate toxicity. Check indication, dose, renal function and monitoring requirements."],
    [["lithium","ibuprofen"],"NSAIDs can increase lithium concentrations and toxicity risk. Monitoring and alternative analgesia should be considered."],
    [["metformin","iodinated contrast"],"Contrast procedures may require patient- and renal-function-specific metformin management. Follow the current product/local protocol."]
  ];
  document.getElementById("ddi-check")?.addEventListener("click",()=>{
    const a=(document.getElementById("ddi-a")?.value||"").trim().toLowerCase();
    const b=(document.getElementById("ddi-b")?.value||"").trim().toLowerCase();
    if(!a||!b) return out("ddi-result","Enter two medicine names.");
    const hit=ddiPairs.find(([pair])=>pair.includes(a)&&pair.includes(b));
    if(hit) out("ddi-result",`<strong>Review flag:</strong> ${hit[1]}`,"alert");
    else out("ddi-result",`No flag in this site's small reference set for <strong>${a}</strong> + <strong>${b}</strong>. That does <strong>not</strong> mean no interaction exists; use a comprehensive interaction reference.`,"clear");
  });
