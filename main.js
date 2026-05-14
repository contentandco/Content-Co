(() => {
  const root = document.documentElement;
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = window.matchMedia("(pointer: fine)");

  function setFinePointer() {
    document.body.classList.toggle("is-pointer-fine", mqFine.matches);
  }

  setFinePointer();
  mqFine.addEventListener("change", setFinePointer);

  if (!mqFine.matches || mqReduce.matches) return;

  let raf = 0;
  let pendingX = 50;
  let pendingY = 42;

  function apply() {
    raf = 0;
    root.style.setProperty("--mx", `${pendingX}%`);
    root.style.setProperty("--my", `${pendingY}%`);
  }

  function onMove(event) {
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    pendingX = x;
    pendingY = y;
    document.body.classList.add("is-cursor-active");
    if (!raf) raf = requestAnimationFrame(apply);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
})();
