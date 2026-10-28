import { useState } from "react";

type Scenario = {
  label: string;
  description: string;
  invoke: () => void;
};

export function ReactCursedApp() {
  const [lastSpell, setLastSpell] = useState("No spells cast yet.");

  const scenarios: Scenario[] = [
    {
      label: "Read a missing profile",
      description: "A component reaches through an undefined API result.",
      invoke: () => {
        setLastSpell("The profile has faded from state...");
        window.setTimeout(() => {
          const response: { user?: { profile: { displayName: string } } } = {};
          void response.user!.profile.displayName;
        }, 0);
      },
    },
    {
      label: "Reject an effect",
      description: "An async UI task escapes without a catch handler.",
      invoke: () => {
        setLastSpell("An effect is escaping the component tree...");
        window.setTimeout(() => Promise.reject(new Error("React effect failed to restore the spectral state.")), 0);
      },
    },
    {
      label: "Fetch a phantom route",
      description: "A client data request returns a deterministic 404.",
      invoke: () => {
        setLastSpell("The query is searching the void...");
        void fetch("/react-demo/api/phantom-profile").then((response) => {
          setLastSpell(`The server answered: HTTP ${response.status}.`);
        });
      },
    },
    {
      label: "Parse corrupted state",
      description: "Persisted client state has invalid JSON.",
      invoke: () => {
        setLastSpell("Hydrating cursed local state...");
        window.setTimeout(() => JSON.parse('{ "theme": "night",, }'), 0);
      },
    },
    {
      label: "Contact the dead service",
      description: "A local dependency refuses a network connection.",
      invoke: () => {
        setLastSpell("The dependency is not answering...");
        void fetch("http://127.0.0.1:65534/react-spectral-service").catch(() => {
          setLastSpell("The service did not answer.");
        });
      },
    },
  ];

  return (
    <main>
      <a className="back" href="/demo/cursed-website/">← Static Cursed Website</a>
      <p className="eyebrow">React failure laboratory</p>
      <h1>The React Cursed App</h1>
      <p className="intro">Open Haunted DevTools and invoke a component-level failure. Each spell mirrors a client-side issue common in React applications.</p>
      <section className="scenario-grid" aria-label="React error scenarios">
        {scenarios.map((scenario) => (
          <article key={scenario.label}>
            <h2>{scenario.label}</h2>
            <p>{scenario.description}</p>
            <button type="button" onClick={scenario.invoke}>Cast spell</button>
          </article>
        ))}
      </section>
      <output aria-live="polite">{lastSpell}</output>
    </main>
  );
}
