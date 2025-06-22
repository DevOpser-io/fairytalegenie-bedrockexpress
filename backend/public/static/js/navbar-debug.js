// Simple navbar debug script
console.log('=== NAVBAR DEBUG SCRIPT STARTED ===');

// Flag to prevent multiple executions
window.navbarDebugExecuted = window.navbarDebugExecuted || false;

function debugNavbar() {
  if (window.navbarDebugExecuted) {
    console.log('Navbar debug already executed, skipping...');
    return;
  }
  console.log('=== NAVBAR DEBUG FUNCTION ===');
  console.log('Window width:', window.innerWidth);
  
  const togglers = document.querySelectorAll('.navbar-toggler');
  console.log('Found navbar-togglers:', togglers.length);
  
  togglers.forEach((toggler, i) => {
    console.log(`Toggler ${i}:`, toggler);
    console.log(`  - Display:`, getComputedStyle(toggler).display);
    console.log(`  - Visibility:`, getComputedStyle(toggler).visibility);
    
    // Force it visible with proper styling
    toggler.style.setProperty('display', 'block', 'important');
    toggler.style.setProperty('visibility', 'visible', 'important');
    toggler.style.setProperty('opacity', '1', 'important');
    toggler.style.setProperty('background-color', 'transparent', 'important');
    toggler.style.setProperty('border', '1px solid rgba(0, 0, 0, 0.2)', 'important');
    toggler.style.setProperty('padding', '0.25rem 0.75rem', 'important');
    toggler.style.setProperty('margin', '0', 'important');
    toggler.style.setProperty('border-radius', '0.375rem', 'important');
    toggler.style.setProperty('font-size', '1.25rem', 'important');
    toggler.style.setProperty('line-height', '1', 'important');
    
    // Style the navbar-toggler-icon
    const togglerIcon = toggler.querySelector('.navbar-toggler-icon');
    if (togglerIcon) {
      togglerIcon.style.setProperty('display', 'inline-block', 'important');
      togglerIcon.style.setProperty('width', '1.5em', 'important');
      togglerIcon.style.setProperty('height', '1.5em', 'important');
      togglerIcon.style.setProperty('vertical-align', 'middle', 'important');
      togglerIcon.style.setProperty('background-repeat', 'no-repeat', 'important');
      togglerIcon.style.setProperty('background-position', 'center', 'important');
      togglerIcon.style.setProperty('background-size', '100%', 'important');
      togglerIcon.style.setProperty('background-image', 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 30 30\'%3e%3cpath stroke=\'rgba%280, 0, 0, 0.55%29\' stroke-linecap=\'round\' stroke-miterlimit=\'10\' stroke-width=\'2\' d=\'M4 7h22M4 15h22M4 23h22\'/%3e%3c/svg%3e")', 'important');
      console.log(`  - Styled navbar-toggler-icon`);
    }
    
    // Connect hamburger menu to sidebar toggle functionality
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.querySelector('.sidebar-content')) {
      // If we have a proper sidebar with content, remove Bootstrap data attributes and add our own handler
      toggler.removeAttribute('data-bs-toggle');
      toggler.removeAttribute('data-bs-target');
      
      // Add navigation items to the sidebar content area ONCE during setup
      let sidebarContent = sidebar.querySelector('.sidebar-content');
      if (sidebarContent && !sidebarContent.querySelector('.mobile-nav-section') && !sidebar.hasAttribute('data-nav-setup')) {
        const navbarCollapse = document.querySelector('#navbarNav');
        
        // Create the navigation section
        const mobileNavSection = document.createElement('div');
        mobileNavSection.className = 'mobile-nav-section';
        mobileNavSection.style.cssText = `
          background: #fff;
          border-top: 1px solid #ddd;
          margin-top: auto;
          padding: 0;
          display: none;
        `;
        
        // Show/hide based on screen size
        function updateMobileNavVisibility() {
          if (window.innerWidth <= 768) {
            mobileNavSection.style.display = 'block';
          } else {
            mobileNavSection.style.display = 'none';
          }
        }
        
        // Set initial visibility
        updateMobileNavVisibility();
        
        // Update on window resize
        window.addEventListener('resize', updateMobileNavVisibility);
        
        // Add divider
        const divider = document.createElement('hr');
        divider.style.cssText = `
          margin: 0.5rem 0;
          border-top: 1px solid #eee;
        `;
        mobileNavSection.appendChild(divider);
        
        // Add navigation items from the navbar (filter out duplicates)
        const navItems = navbarCollapse ? navbarCollapse.querySelectorAll('.nav-link') : [];
        console.log('Found nav items in navbar:', navItems.length);
        
        // Create a Set to track unique nav items by href
        const uniqueNavItems = new Map();
        navItems.forEach((navItem, index) => {
          console.log(`Nav item ${index}:`, navItem.textContent.trim(), navItem.href);
          if (!uniqueNavItems.has(navItem.href)) {
            uniqueNavItems.set(navItem.href, navItem);
          }
        });
        
        console.log('Unique nav items after deduplication:', uniqueNavItems.size);
        console.log('Final nav items to add to sidebar:');
        uniqueNavItems.forEach((navItem, href) => {
          console.log(`  - ${navItem.textContent.trim()} (${href})`);
        });
        
        uniqueNavItems.forEach((navItem) => {
          const navLink = document.createElement('a');
          navLink.href = navItem.href;
          navLink.textContent = navItem.textContent;
          navLink.className = 'nav-link mobile-nav-link';
          navLink.style.cssText = `
            display: block;
            padding: 0.75rem 1rem;
            color: #374151;
            text-decoration: none;
            font-weight: 500;
            border-radius: 6px;
            transition: all 0.2s ease;
            margin: 0.25rem 1rem;
          `;
          
          navLink.addEventListener('mouseover', function() {
            this.style.backgroundColor = '#f8f9fa';
            this.style.color = '#ED166C';
          });
          navLink.addEventListener('mouseout', function() {
            this.style.backgroundColor = 'transparent';
            this.style.color = '#374151';
          });
          
          mobileNavSection.appendChild(navLink);
        });
        
        // Append to sidebar content at the bottom
        sidebarContent.appendChild(mobileNavSection);
        
        // Mark sidebar as having nav setup to prevent duplicates
        sidebar.setAttribute('data-nav-setup', 'true');
        console.log('Added integrated navigation to sidebar');
      }
      
      // Add close button ONCE during setup
      if (!sidebar.querySelector('.sidebar-close-btn')) {
        const closeButton = document.createElement('button');
        closeButton.className = 'sidebar-close-btn';
        closeButton.innerHTML = '×';
        closeButton.style.cssText = `
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid #e5e7eb;
          border-radius: 50%;
          color: #4b5563;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          z-index: 1060;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        `;
        
        closeButton.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          sidebar.classList.remove('active');
          sidebar.style.transform = 'translateX(-100%)';
          console.log('Sidebar closed via close button');
        });
        
        sidebar.appendChild(closeButton);
        
        // Show/hide close button based on screen size
        function updateCloseButtonVisibility() {
          if (window.innerWidth <= 768) {
            closeButton.style.display = 'flex';
          } else {
            closeButton.style.display = 'none';
          }
        }
        
        // Set initial visibility
        updateCloseButtonVisibility();
        
        // Update on window resize
        window.addEventListener('resize', updateCloseButtonVisibility);
        
        console.log('Added close button to sidebar');
      }
      
      toggler.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Hamburger menu clicked - toggling sidebar!');
        
        const isActive = sidebar.classList.contains('active');
        
        if (isActive) {
          sidebar.classList.remove('active');
          sidebar.style.transform = 'translateX(-100%)';
          console.log('Sidebar closed');
        } else {
          sidebar.classList.add('active');
          sidebar.style.transform = 'translateX(0)';
          console.log('Sidebar opened');
        }
      });
      console.log(`  - Connected toggler to sidebar functionality`);
    } else {
      console.log(`  - No proper sidebar found, keeping Bootstrap navbar collapse behavior`);
      // Ensure Bootstrap data attributes are preserved for pages without sidebar
      toggler.setAttribute('data-bs-toggle', 'collapse');
      toggler.setAttribute('data-bs-target', '#navbarNav');
      toggler.setAttribute('aria-controls', 'navbarNav');
      toggler.setAttribute('aria-expanded', 'false');
      console.log(`  - Restored Bootstrap collapse attributes`);
      
      // Style the navbar collapse for better mobile UX on pages without sidebar
      const navbarCollapse = document.querySelector('#navbarNav');
      if (navbarCollapse) {
        // Function to apply mobile-specific styling
        function applyMobileNavbarStyling() {
          if (window.innerWidth <= 768) {
            navbarCollapse.style.cssText = `
              position: absolute;
              top: 100%;
              left: 0;
              right: 0;
              background: white;
              border: 1px solid #ddd;
              border-top: none;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
              z-index: 1000;
            `;
            
            // Style the nav items for mobile
            const navItems = navbarCollapse.querySelectorAll('.nav-link');
            navItems.forEach(navItem => {
              navItem.style.cssText = `
                display: block !important;
                padding: 0.75rem 1rem;
                color: #374151 !important;
                text-decoration: none;
                border-bottom: 1px solid #eee;
                background: white;
              `;
            });
          } else {
            // Reset to default desktop styling
            navbarCollapse.style.cssText = '';
            
            // Reset nav items to default styling
            const navItems = navbarCollapse.querySelectorAll('.nav-link');
            navItems.forEach(navItem => {
              navItem.style.cssText = '';
            });
          }
        }
        
        // Apply initial styling
        applyMobileNavbarStyling();
        
        // Update on window resize
        window.addEventListener('resize', applyMobileNavbarStyling);
        
        console.log(`  - Set up responsive navbar collapse styling`);
      }
    }
    
    console.log(`  - After forcing, display:`, getComputedStyle(toggler).display);
  });
  
  // Set flag to prevent re-execution
  window.navbarDebugExecuted = true;
  console.log('=== NAVBAR DEBUG COMPLETED ===');
}

// Only run once when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', debugNavbar);
} else {
  debugNavbar();
}

console.log('=== NAVBAR DEBUG SCRIPT ENDED ===');