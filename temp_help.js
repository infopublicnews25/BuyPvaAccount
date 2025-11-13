// Help Function
function submitHelp(event) {
    event.preventDefault();
    const topic = document.getElementById('helpTopic').value;
    const message = document.getElementById('helpMessage').value;
    const email = document.getElementById('helpEmail').value;

    // You can implement the actual help submission logic here
    // For now, we'll just show an alert
    alert(`Help request received!\n\nTopic: ${topic}\nEmail: ${email}\n\nWe'll respond to your message soon.`);
    
    // Clear the form
    document.getElementById('helpForm').reset();
}