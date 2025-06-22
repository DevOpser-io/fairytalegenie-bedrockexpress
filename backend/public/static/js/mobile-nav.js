/**
 * Mobile Navigation for Bedrock Express AI Chat
 * Handles sidebar toggle and conversation selection on mobile devices
 */
console.log('=== MOBILE-NAV.JS SCRIPT LOADED ===');
console.log('Document ready state:', document.readyState);
console.log('Current URL:', window.location.href);

document.addEventListener('DOMContentLoaded', function() {
  console.log('=== MOBILE-NAV.JS DOM CONTENT LOADED ===');
  
  // Basic DOM check
  console.log('Navbar elements found:', document.querySelectorAll('nav').length);
  console.log('Header elements found:', document.querySelectorAll('header').length);
  console.log('Total elements in DOM:', document.querySelectorAll('*').length);
  // Handle New Chat button clicks to close mobile navigation
  const newChatButton = document.getElementById('new-chat-btn');
  if (newChatButton) {
    const originalClickHandler = newChatButton.onclick;
    
    newChatButton.addEventListener('click', function(e) {
      // If we're on mobile, close the sidebar
      if (window.innerWidth < 769) {
        // Find the sidebar element
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          sidebar.classList.remove('active');
          sidebar.style.transform = 'translateX(-100%)';
        }
      }
      
      // Execute original click handler if it exists
      if (typeof originalClickHandler === 'function') {
        originalClickHandler(e);
      }
    });
  }
  
  // DOM elements
  const sidebar = document.querySelector('.sidebar');
  const allNavbarTogglers = document.querySelectorAll('.navbar-toggler');
  
  console.log('Mobile nav debug:');
  console.log('- Window width:', window.innerWidth);
  console.log('- Found navbar-togglers:', allNavbarTogglers.length);
  console.log('- Sidebar found:', !!sidebar);
  
  allNavbarTogglers.forEach((toggler, index) => {
    console.log(`- Toggler ${index}:`, toggler);
    console.log(`  - Current display:`, getComputedStyle(toggler).display);
    console.log(`  - Current visibility:`, getComputedStyle(toggler).visibility);
  });
  
  // Show navbar-togglers on mobile, hide on desktop
  allNavbarTogglers.forEach((toggler, index) => {
    if (window.innerWidth <= 768) {
      toggler.style.setProperty('display', 'block', 'important');
      toggler.style.setProperty('visibility', 'visible', 'important');
      toggler.style.setProperty('opacity', '1', 'important');
      toggler.style.setProperty('position', 'relative', 'important');
      console.log(`- Set toggler ${index} to display: block on mobile`);
      console.log(`  - After setting, display:`, getComputedStyle(toggler).display);
    } else {
      toggler.style.setProperty('display', 'none', 'important');
      console.log(`- Set toggler ${index} to display: none on desktop`);
    }
  });
  
  // Update navbar-toggler visibility on window resize
  window.addEventListener('resize', () => {
    console.log('Window resized, width:', window.innerWidth);
    allNavbarTogglers.forEach((toggler, index) => {
      if (window.innerWidth <= 768) {
        toggler.style.setProperty('display', 'block', 'important');
        toggler.style.setProperty('visibility', 'visible', 'important');
        toggler.style.setProperty('opacity', '1', 'important');
        console.log(`- Resize: Set toggler ${index} to display: block`);
      } else {
        toggler.style.setProperty('display', 'none', 'important');
        console.log(`- Resize: Set toggler ${index} to display: none`);
      }
    });
  });
  
  // Add a delayed check to see if something else is hiding the toggler
  setTimeout(() => {
    console.log('=== Delayed check (1 second later) ===');
    const newNavbarTogglers = document.querySelectorAll('.navbar-toggler');
    newNavbarTogglers.forEach((toggler, index) => {
      console.log(`- Toggler ${index} after 1 second:`);
      console.log(`  - Display:`, getComputedStyle(toggler).display);
      console.log(`  - Visibility:`, getComputedStyle(toggler).visibility);
      console.log(`  - Opacity:`, getComputedStyle(toggler).opacity);
      console.log(`  - Position:`, getComputedStyle(toggler).position);
      console.log(`  - Z-index:`, getComputedStyle(toggler).zIndex);
      
      // Force it visible again
      if (window.innerWidth <= 768) {
        toggler.style.setProperty('display', 'block', 'important');
        toggler.style.setProperty('visibility', 'visible', 'important');
        toggler.style.setProperty('opacity', '1', 'important');
        console.log(`  - Forced visible again`);
      }
    });
  }, 1000);
  
  // Bail early if we're not on a page with these elements
  if (!sidebar) return;
  
  // Setup conversation item click handlers
  function setupConversationItemHandlers() {
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const conversationId = item.dataset.id;
        
        // Update selected state
        document.querySelectorAll('.conversation-item').forEach(i => {
          i.classList.remove('selected');
        });
        item.classList.add('selected');
        
        // Load the conversation
        if (typeof selectConversation === 'function') {
          selectConversation(conversationId);
        }
        
        // Close the menu on mobile
        if (window.innerWidth < 769) {
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) {
            sidebar.classList.remove('active');
            sidebar.style.transform = 'translateX(-100%)';
          }
        }
      });
    });
  }

  // Setup conversation item click handlers using a MutationObserver
  // This ensures it works even when the conversation list is loaded dynamically
  const conversationListObserver = new MutationObserver(function(mutations) {
    setupConversationItemHandlers();
  });

  const conversationList = document.querySelector('.conversation-list');
  if (conversationList) {
    conversationListObserver.observe(conversationList, { childList: true, subtree: true });
    
    // Also set up any existing items
    setupConversationItemHandlers();
  }
  
  // Bootstrap 5 handles navbar toggling automatically via data attributes
});
