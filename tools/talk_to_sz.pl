#!/usr/bin/env perl

use strict;
use warnings;
use autodie;

use constant CANCEL_BYTES => (
    ((24) x 5),
    ((8) x 5),
    #0,
);

use constant ZCAN_BYTES => (
    42, 42, 24, 66, 49, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 52, 53, 97, 13, 10, 17
);

use constant VERBOSE => '-vvvvvvvvvvvv';

use feature 'say';

use IO::Poll ();
use File::Temp ();
use File::Which ();
use Text::Control ();

my $COMMAND = 'sz';

#my @verbose_flags = ( VERBOSE() );
my @verbose_flags = ();

my $size = 2**24;

my $file_content = ('x' x $size) . '=THE END';

my $cmd_path = File::Which::which($COMMAND) or die "Need “$COMMAND”!";

#$cmd_path = '/Users/felipe/code/lrzsz/src/lsz';

my ($tfh, $tpath) = File::Temp::tempfile( CLEANUP => 1 );
print "temp file path: $tpath\n";
syswrite $tfh, $file_content;
close $tfh;

pipe( my $pr, my $cw );
pipe( my $cr, my $pw );
my $pid = fork or do {
    close $_ for ($pr, $pw);
    open \*STDIN, '<&=', $cr;
    open \*STDOUT, '>>&=', $cw;
    exec $cmd_path, @verbose_flags, $tpath or die $!;
};

close $_ for ($cr, $cw);

$pr->blocking(0);

my $poll = IO::Poll->new();
$poll->mask( $pr, IO::Poll::POLLIN() );

sub _poll_in {
    return $poll->poll(30) || die 'Timed out on read!';
}

sub _read {
    _poll_in();

    my $buf = q<>;
    sysread( $pr, $buf, 4096, length $buf );   #it’ll never be that big
    return $buf;
}

sub _read_and_report {
    my $input = _read();
    _report_from_child($input);
}

sub _report_from_child {
    my $bytes = $_[0];

    my $truncated_yn;
    my $orig_len = length $bytes;

    if ($orig_len > 70) {
        substr($bytes, 25) = q<>;
        $truncated_yn = 1;
    }

    $bytes = Text::Control::to_hex($bytes);
    if ($truncated_yn) {
        $bytes .= ' … ' . Text::Control::to_hex( substr($_[0], -45) );
        $bytes .= " ($orig_len bytes)";
    }

    say "$COMMAND says: $bytes";
}

sub _write { syswrite $pw, $_[0]; }

sub _write_octets {
    my $bytes = join( q<>, map { chr } @_ );
    _write( $bytes );
    say "to $COMMAND: " . Text::Control::to_hex($bytes);
}

sub _write_and_wait_to_finish {
    _write_octets(@_);

    _wait_to_finish();
}

sub _wait_to_finish {
    close $pw;

    $pr->blocking(1);
    my $buf = q<>;
    while (my $read = sysread $pr, $buf, 65536) {
        if ($buf =~ m<=THE END>) {
            print STDERR "\x07XXXXX FAILED TO STOP THE ONSLAUGHT!!\n";
            sleep 2;
        }

        print "=========== FINAL ($read) ===========\n";
        _report_from_child($buf);
    }

    close $pr;

    waitpid $pid, 0;
    my $exit = $? >> 8;
    print "$COMMAND exit: $exit\n";

    exit;
}

sub _send_cancel {
    print "======= SENDING CANCEL\n";
    _write_and_wait_to_finish( CANCEL_BYTES() );
}

sub _read_until_packet_end {
    my $buf = q<>;

    my $next_header;

    while (1) {
        if ($buf =~ m<\x18h..(.*)>) {
            $next_header = $1;
            last;
        }

        _poll_in();
        sysread $pr, $buf, 65536, length $buf;
    }

    print "\nEnd of packet\n";
    _report_from_child($next_header) if length $next_header;
    return;
}

sub _send_ZCAN {
    print "======= SENDING ZCAN\n";
    _write_and_wait_to_finish( ZCAN_BYTES() );
}

#----------------------------------------------------------------------

#Shows ZRQINIT
_read_and_report();

#_send_cancel();    #works
#_send_ZCAN();      #doesn’t work

use constant ZRINIT_BYTES => (
    #CANOVIO, CANFDX
    #42, 42, 24, 66, 48, 49, 48, 48, 48, 48, 48, 48, 48, 48, 97, 97, 53, 49, 13, 10, 17,

    #CANOVIO, CANFDX, CANFC32
    qw( 42 42 24 66 48 49 48 48 48 48 48 48 50 51 98 101 53 48 13 10 17 ),
);

use constant ZSKIP_BYTES => (
    42, 42, 24, 66, 48, 53, 48, 48, 48, 48, 48, 48, 48, 48, 50, 51, 53, 55, 13, 10, 17,
);

#ZRINIT
_write_octets( ZRINIT_BYTES() );

#Shows ZFILE and offer subpacket
_read_and_report();

#_send_cancel();    #works
#_send_ZCAN();      #works

#ZRPOS
_write_octets(
    42, 42, 24, 66, 48, 57, 48, 48, 48, 48, 48, 48, 48, 48, 97, 56, 55, 99, 13, 10, 17
);

#Shows initial batch of file data
#_read_and_report();
#
#_send_ZCAN();      #works - BUFFER OVERFLOW
_send_cancel();    #works - BUFFER OVERFLOW

_read_and_report();

#_write_octets( ZSKIP_BYTES() );

#_read_until_packet_end();

#_send_cancel();    #works

#ZRINIT
_write_octets( ZRINIT_BYTES() );

#_send_cancel();    #works

_read_and_report();

_send_cancel();    #works - but by this point the transfer is done

#ZFIN
_write_octets(
    42, 42, 24, 66, 48, 56, 48, 48, 48, 48, 48, 48, 48, 48, 48, 50, 50, 100, 13, 10
);

_wait_to_finish();
