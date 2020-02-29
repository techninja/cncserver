/**
 * @file Util to help catch initialization of the API early or late.
 */
/* globals document */
let apiReady = false;

// Register to the init event early.
document.addEventListener('cncserver-init', () => {
  apiReady = true;
});

export default (callback) => {
  if (apiReady) {
    callback();
  } else {
    document.addEventListener('cncserver-init', callback);
  }
};
