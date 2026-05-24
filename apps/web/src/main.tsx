import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import App from './App'
import Queue from './routes/Queue'
import Inventory from './routes/Inventory'
import Gathering from './routes/Gathering'
import Projects from './routes/Projects'
import { ProjectFilterProvider } from './lib/projectFilter'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Queue /> },
      { path: 'gathering', element: <Gathering /> },
      { path: 'inventory', element: <Inventory /> },
      { path: 'projects', element: <Projects /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProjectFilterProvider>
      <RouterProvider router={router} />
    </ProjectFilterProvider>
  </React.StrictMode>,
)
