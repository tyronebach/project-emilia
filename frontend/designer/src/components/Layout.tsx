import { Link, Outlet } from '@tanstack/react-router'
import { Sparkles, Users, Heart, Home } from 'lucide-react'

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-8">
          <Sparkles className="w-6 h-6 text-violet-400" />
          <h1 className="text-xl font-bold text-white">Agent Designer</h1>
        </div>
        
        <nav className="space-y-2">
          <NavLink to="/" icon={<Home className="w-5 h-5" />}>
            Dashboard
          </NavLink>
          <NavLink to="/agents" icon={<Users className="w-5 h-5" />}>
            Agents
          </NavLink>
          <NavLink to="/relationships" icon={<Heart className="w-5 h-5" />}>
            Relationships
          </NavLink>
        </nav>
        
        <div className="absolute bottom-4 left-4 right-4">
          <div className="text-xs text-gray-500 text-center">
            Emilia Project v1.0
          </div>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ 
  to, 
  icon, 
  children 
}: { 
  to: string
  icon: React.ReactNode
  children: React.ReactNode 
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors [&.active]:bg-violet-500/20 [&.active]:text-violet-300 [&.active]:border [&.active]:border-violet-500/30"
      activeProps={{ className: 'active' }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  )
}
