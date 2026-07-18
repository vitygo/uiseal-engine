<?php
// A plain .php file (not *.blade.php) — must never be scanned, even though
// it contains something that would look like a violation if it were.
class UserController {
    public $style = "color: #123456";
}
