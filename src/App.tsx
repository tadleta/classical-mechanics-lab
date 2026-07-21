import { CanvasScene } from './components/CanvasScene';
import { Controls } from './components/Controls';

function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 p-6 text-center">
        <h1 className="text-4xl font-bold">Classical Mechanics Lab</h1>
        <p className="text-zinc-400 mt-2">Interactive Projectile & Physics Simulator</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <CanvasScene />
        </div>

        <div className="w-96 border-l border-zinc-800 bg-zinc-900 overflow-auto p-6">
          <Controls />
        </div>
      </div>
    </div>
  );
}

export default App;
