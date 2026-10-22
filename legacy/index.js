const jumbled = ["epiertl", "foprerm", "ocnialtoi", "uaqrtre", "nesreu", "soehu", "iavreelt", "erogast", "txmneeipo", "rphees", "nlskteoe", "miailunum", "nrbkeo", "ntnatiriso", "reetporr", "sitecrde", "evisiced", "arselee", "htrates", "deispes", "tehrnc", "ocinsu", "eurndinem", "eprecsne", "iqntau"]

const correct = ["reptile", "perform", "coalition", "quarter", "ensure", "house", "relative", "storage", "exemption", "sphere", "skeleton", "   ", "broken", "transition", "reporter", "discreet", "decisive", "release", "release", "despise", "trench", "cousin", "undermine", "presence", "quaint"]

const playEL = document.getElementById("start-btn");
const resultEL = document.querySelector(".result");

let currentWord;

function display(){
    currentWord = Math.floor(Math.random() * jumbled.length);

    resultEL.innerHTML = `
        <p class="outcome">${jumbled[currentWord]}</p>
        <input type="text" placeholder="Enter answer" id="input">
        <button id="submit-btn">Submit</button>
        <button id="again-btn">Play Again</button>
    `;
}

function handleComp(){
    const input = document.getElementById("input").value.trim().toLowerCase();

    if (input === correct[currentWord]) {
        resultEL.innerHTML = `
            <p class="outcome">Correct!</p>
            <button id="again-btn">Play Again</button>
        `;
    } else {
        resultEL.innerHTML = `
            <p class="outcome">${jumbled[currentWord]}</p>
            <input type="text" placeholder="Enter answer" id="input">
            <button id="submit-btn">Submit</button>
            <button id="again-btn">Play Again</button>
            <p class="error">Wrong! Try again</p>
        `;
    }
}

playEL.addEventListener("click", function(e){
    e.preventDefault();
    playEL.classList.add("hidden");
    resultEL.classList.remove("hidden");
    display();
});

resultEL.addEventListener("click", function(e){

    if(e.target.id === "submit-btn"){
        handleComp();
    }

    if(e.target.id === "again-btn"){
        display();
    }

});