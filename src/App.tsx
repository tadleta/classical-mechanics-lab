import { CanvasScene } from './components/CanvasScene';

function App() {
  return (
    <div className="h-screen w-screen bg-zinc-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">Classical Mechanics Lab</h1>
        <p className="text-zinc-400 text-sm mt-1">Interactive Projectile & Physics Simulator</p>
      </header>

      {/* Main area - takes remaining space but with a little breathing room */}
      <main className="flex-1 relative min-h-0 p-3">
        <div className="w-full h-full rounded-xl overflow-hidden border border-zinc-800 bg-black">
          <CanvasScene />
        </div>
      </main>
    </div>
  );
}

export default App;